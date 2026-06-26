const fs = require('fs');
const path = 'C:/Users/HP/Downloads/capital-crew/src/auth/_anon.js';
const anon = fs.existsSync(path)
  ? fs.readFileSync(path, 'utf8').trim()
  : require(path);
console.log('loaded key, len=', anon.length);
const url = 'https://xqhnjbbewoldwtndxfrm.supabase.co';
const payload = {
  username: 'siteverify',
  password_hash: '$2a$10$K7zv8VrRuMxLy5gkH1yWxeQfA82cVe6gZd6DX.hZHLPzJNQpZXXWy',
};
(async () => {
  const r = await fetch(url + '/functions/v1/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: 'Bearer ' + anon },
    body: JSON.stringify(payload),
  });
  console.log('SIGNUP:', r.status, await r.text());
  const r2 = await fetch(url + '/functions/v1/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: 'Bearer ' + anon },
    body: JSON.stringify(payload),
  });
  console.log('SIGNIN:', r2.status, await r2.text());
})();
