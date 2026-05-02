#!/usr/bin/env node
// Usage: node generate-license.js customer@example.com
// Reads LICENSE_SECRET from .env.local automatically.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

try {
  fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
  });
} catch {}

const email = process.argv[2];
const secret = process.argv[3] || process.env.LICENSE_SECRET;

if (!email) {
  console.error('Usage: node generate-license.js <email>');
  process.exit(1);
}
if (!secret) {
  console.error('Error: LICENSE_SECRET not found. Set it in .env.local or pass as second argument.');
  process.exit(1);
}

const norm = email.toLowerCase().trim();
const code = crypto.createHmac('sha256', secret).update(norm).digest('hex').substring(0, 16);

console.log(`\nEmail: ${norm}`);
console.log(`Code:  ${code}\n`);
