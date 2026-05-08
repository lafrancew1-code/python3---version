const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');

const GUMROAD_PRODUCT = 'xcbdvf';

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

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ valid: false, error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Invalid body' }) }; }

  const { license_key } = body || {};
  if (!license_key) return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'License key required' }) };

  // Admin bypass — derived from LICENSE_SECRET
  const secret = (process.env.LICENSE_SECRET || '').trim();
  if (secret) {
    const adminKey = crypto.createHmac('sha256', secret).update('admin').digest('hex').substring(0, 16).toUpperCase();
    if (license_key.trim().toUpperCase() === adminKey) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: true }) };
    }
  }

  try {
    const result = await callGumroad(license_key.trim());
    if (result.valid) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: true }) };
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: result.error || 'Invalid license key' }) };
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ valid: false, error: 'Could not reach license server' }) };
  }
};
