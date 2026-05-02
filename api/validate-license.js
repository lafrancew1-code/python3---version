const https = require('https');

const WHOP_PRODUCT_ID = 'prod_FhQkubpj4IiKz';

function callWhop(licenseKey, apiKey) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ license_key: licenseKey, metadata: {} });
    const req = https.request({
      hostname: 'api.whop.com',
      path: '/api/v2/licenses/validate',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode === 200) {
            // Confirm it belongs to this product if Whop returns product info
            const productId = parsed.product_id || parsed.membership?.product_id;
            if (productId && productId !== WHOP_PRODUCT_ID) {
              resolve({ valid: false, error: 'License not valid for this product' });
            } else if (parsed.status && parsed.status !== 'active') {
              resolve({ valid: false, error: 'License is ' + parsed.status });
            } else {
              resolve({ valid: true });
            }
          } else {
            const errMsg = typeof parsed.error === 'string' ? parsed.error : (typeof parsed.message === 'string' ? parsed.message : 'Invalid license key');
            resolve({ valid: false, error: errMsg });
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

  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) { res.status(500).json({ valid: false, error: 'Server config error' }); return; }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const { license_key } = body;
  if (!license_key || typeof license_key !== 'string') {
    res.status(400).json({ valid: false, error: 'License key required' });
    return;
  }

  // Admin bypass
  const adminKey = (process.env.ADMIN_KEY || '').trim();
  if (adminKey && license_key.trim().toUpperCase() === adminKey.toUpperCase()) {
    res.status(200).json({ valid: true });
    return;
  }

  try {
    const result = await callWhop(license_key.trim(), apiKey);
    if (result.valid) {
      res.status(200).json({ valid: true });
    } else {
      res.status(400).json({ valid: false, error: result.error || 'Invalid license key' });
    }
  } catch (err) {
    console.error('Whop validation error:', err.message);
    res.status(500).json({ valid: false, error: 'Could not reach license server' });
  }
};
