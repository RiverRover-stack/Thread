import fs from 'node:fs';
const names=[...fs.readFileSync('tests/login-session.test.ts','utf8').matchAll(/^test\("([^"]+)"/gm)].map(m=>m[1]);
fs.appendFileSync('DEPLOYMENT_RESULTS.md', '\n## Login-page update — 4 October 2026\n\n' +
  'Revision: `666e289`. All 90 automated tests, ESLint, and production build pass.\n\n' +
  'The normal `/login` form replaces the browser Basic prompt. Correct credentials set an eight-hour signed, HttpOnly, Secure, SameSite=Strict cookie. Logout clears the cookie; password rotation invalidates existing sessions. Production still fails closed without usable configuration. APIs retain independent access checks; login and cookie-authenticated writes require same-origin requests.\n\n' +
  'The embedded browser successfully signed in and displayed the capture page, then signed out to the login page. The capture notice now reflects hosted Google or local Ollama inference. Browser microphone capture remains a manual check.\n\n' +
  'During verification, Next URL normalization and Node fetch metadata exposed two compatibility issues. Both were corrected and regression tests added. The CLI correction was committed and pushed after the user approved the previously declined execution request.\n\n' +
  'Additional automated tests ('+names.length+'):\n\n'+names.map(n=>'- '+n).join('\n')+'\n');
console.log('Login test record added.');
