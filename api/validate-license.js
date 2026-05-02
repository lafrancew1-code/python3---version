const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ valid: false, error: 'Method not allowed' }); return; }

  const secret = process.env.LICENSE_SECRET;
  if (!secret) { res.status(500).json({ valid: false, error: 'Server config error' }); return; }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const { email, code } = body;
  if (!email || !code) { res.status(400).json({ valid: false, error: 'Email and code required' }); return; }

  const norm = email.toLowerCase().trim();
  const expected = crypto.createHmac('sha256', secret).update(norm).digest('hex').substring(0, 16);

  const a = Buffer.from(code.toLowerCase().trim().padEnd(16, '\0'), 'utf8');
  const b = Buffer.from(expected.padEnd(16, '\0'), 'utf8');
  let valid = false;
  try { valid = a.length === b.length && crypto.timingSafeEqual(a, b); } catch {}

  if (valid) { res.status(200).json({ valid: true, email: norm }); }
  else { res.status(400).json({ valid: false, error: 'Invalid email or code' }); }
};
