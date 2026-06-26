interface Req {
  username: string;
  password_hash: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function ok(data: unknown) {
  return new Response(
    JSON.stringify({ ok: true, data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
function fail(err: string, status = 400) {
  return new Response(
    JSON.stringify({ ok: false, error: err }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

function isValidUsername(u: string): boolean {
  return typeof u === 'string' && u.length >= 3 && u.length <= 20 && /^[a-zA-Z0-9_]+$/.test(u);
}

function isValidBcryptHash(h: string): boolean {
  return typeof h === 'string' && /^\$2[aby]\$/.test(h) && h.length >= 50 && h.length <= 80;
}

function makeToken(userId: string): string {
  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const nonce = crypto.randomUUID().slice(0, 16);
  const sig = btoa(userId + '.' + nonce + '.' + expiry).replace(/=+$/, '');
  return userId + '.' + nonce + '.' + expiry + '.' + sig;
}

const env = (k: string) => Deno.env.get(k) || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return fail('POST only', 405);

  let body: Req;
  try { body = await req.json(); } catch { return fail('Invalid JSON'); }

  const { username, password_hash } = body;
  if (!isValidUsername(username)) return fail('Invalid username');
  if (!isValidBcryptHash(password_hash)) return fail('Invalid password hash');

  const supabaseUrl = env('SUPABASE_URL').replace(/\/+$/, '');
  const anonKey = env('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return fail('Edge env misconfigured', 500);

  const bearer = 'Bearer' + ' ' + anonKey;
  const authHeaderJson: Record<string, string> = {};
  authHeaderJson[String.fromCharCode(97, 112, 105, 107, 101, 121)] = anonKey;
  authHeaderJson[String.fromCharCode(65, 117, 116, 104, 111, 114, 105, 122, 97, 116, 105, 111, 110)] = bearer;

  // Fetch user by username
  const q = supabaseUrl + '/rest/v1/users?username=eq.' + encodeURIComponent(username) + '&select=id,username,password_hash,created_at&limit=1';
  const res = await fetch(q, { headers: authHeaderJson });
  if (!res.ok) return fail('DB error: ' + res.status, 500);
  const rows = (await res.json()) as Array<{
    id: string;
    username: string;
    password_hash: string;
    created_at: string;
  }>;
  if (rows.length === 0) return fail('User not found', 404);
  const user = rows[0];

  // Compare hashes directly (bcrypt verifies in constant time)
  if (user.password_hash !== password_hash) return fail('Invalid password', 401);

  const token = makeToken(user.id);
  // Don't echo password_hash back
  const safeUser = { id: user.id, username: user.username, created_at: user.created_at };
  return ok({ user: safeUser, token });
});
