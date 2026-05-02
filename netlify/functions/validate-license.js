const crypto = require('crypto');

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ valid: false, error: 'Method not allowed' }) };

  const secret = process.env.LICENSE_SECRET;
  if (!secret) return { statusCode: 500, headers, body: JSON.stringify({ valid: false, error: 'Server config error' }) };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Invalid body' }) }; }

  const { email, code } = body || {};
  if (!email || !code) return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Email and code required' }) };

  const norm = email.toLowerCase().trim();
  const expected = crypto.createHmac('sha256', secret).update(norm).digest('hex').substring(0, 16);

  const a = Buffer.from(code.toLowerCase().trim().padEnd(16, '\0'), 'utf8');
  const b = Buffer.from(expected.padEnd(16, '\0'), 'utf8');
  let valid = false;
  try { valid = a.length === b.length && crypto.timingSafeEqual(a, b); } catch {}

  if (valid) return { statusCode: 200, headers, body: JSON.stringify({ valid: true, email: norm }) };
  return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Invalid email or code' }) };
};
