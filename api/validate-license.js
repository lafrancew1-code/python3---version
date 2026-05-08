const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');

const GUMROAD_PRODUCT = 'xcbdvf'; // permalink (also works for verification)

function callGumroad(licenseKey) {
  return new Promise((resolve, reject) => {
    const data = querystring.stringify({
      product_permalink: GUMROAD_PRODUCT,
      license_key: licenseKey,
      increment_uses_count: 'false'
    });
    const req = https.request({
      hostname: 'api.gumroad.com',
      path: '/v2/licenses/verify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.success) {
            resolve({ valid: true });
          } else {
            const msg = typeof parsed.message === 'string' ? parsed.message : 'Invalid license key';
            resolve({ valid: false, error: msg });
          }
        } catch {
          resolve({ valid: false, error: 'Invalid response from license server' });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ valid: false, error: 'Method not allowed' }); return; }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const { license_key } = body;
  if (!license_key || typeof license_key !== 'string') {
    res.status(400).json({ valid: false, error: 'License key required' });
    return;
  }

  // Admin bypass — derived from LICENSE_SECRET
  const secret = (process.env.LICENSE_SECRET || '').trim();
  if (secret) {
    const adminKey = crypto.createHmac('sha256', secret).update('admin').digest('hex').substring(0, 16).toUpperCase();
    if (license_key.trim().toUpperCase() === adminKey) {
      res.status(200).json({ valid: true });
      return;
    }
  }

  try {
    const result = await callGumroad(license_key.trim());
    if (result.valid) {
      res.status(200).json({ valid: true });
    } else {
      res.status(400).json({ valid: false, error: result.error || 'Invalid license key' });
    }
  } catch (err) {
    console.error('Gumroad validation error:', err.message);
    res.status(500).json({ valid: false, error: 'Could not reach license server' });
  }
};
