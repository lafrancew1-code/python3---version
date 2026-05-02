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

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ valid: false, error: 'Method not allowed' }) };

  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ valid: false, error: 'Server config error' }) };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Invalid body' }) }; }

  const { license_key } = body || {};
  if (!license_key) return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'License key required' }) };

  // Admin bypass
  const adminKey = process.env.ADMIN_KEY;
  if (adminKey && license_key.trim() === adminKey) {
    return { statusCode: 200, headers, body: JSON.stringify({ valid: true }) };
  }

  try {
    const result = await callWhop(license_key.trim(), apiKey);
    if (result.valid) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: true }) };
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: result.error || 'Invalid license key' }) };
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ valid: false, error: 'Could not reach license server' }) };
  }
};
