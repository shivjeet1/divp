#!/usr/bin/env node
/**
 * Creates (or completes) the root .env from .env.example, generating a
 * cryptographically strong JWT_SECRET when missing. Never overwrites
 * existing values.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const examplePath = path.join(root, '.env.example');
const envPath = path.join(root, '.env');

if (!fs.existsSync(envPath)) {
  fs.copyFileSync(examplePath, envPath);
  console.log('Created .env from .env.example');
}

let contents = fs.readFileSync(envPath, 'utf8');
if (/^JWT_SECRET=$/m.test(contents)) {
  const secret = crypto.randomBytes(48).toString('base64url');
  contents = contents.replace(/^JWT_SECRET=$/m, `JWT_SECRET=${secret}`);
  fs.writeFileSync(envPath, contents);
  console.log('Generated a strong JWT_SECRET inside .env');
} else {
  console.log('JWT_SECRET already set - left untouched');
}
console.log(`Done: ${envPath}`);
