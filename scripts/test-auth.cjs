const bcrypt = require('bcryptjs');
const fs = require('fs');

// Anon key lives in this separate file so chat-redaction doesn't strip it.
const ANON_KEY = 'PASTE_ANON_HERE';
const URL = 'https://xqhnjbbewoldwtndxfrm.supabase.co';

(async () => {
  const cmd = process.argv[2];
  const username = process.argv[3] || 'testuser1';
  const password = process.argv[4] || 'testpass123';

  if (ANON_KEY === 'PASTE_ANON_HERE') {
    console.error('Edit scripts/_anon.js to add the anon key first.');
    process.exit(1);
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const payload = { username, password_hash: passwordHash };

  const path =
    cmd === 'in' ? '/functions/v1/signin' : '/functions/v1/signup';

  const res = await fetch(URL + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: 'Bearer ' + ANON_KEY,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  console.log('STATUS:', res.status);
  console.log(body);
})().catch(e => {
  console.error('ERR', e);
  process.exit(1);
});
