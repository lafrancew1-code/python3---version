#!/usr/bin/env node
// Local dev server — serves public/ + handles /.netlify/functions/analyze
// Run: node dev-server.js   (requires ANTHROPIC_API_KEY in .env or .env.local)

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8888;
const PUBLIC = path.join(__dirname, 'public');

// Load .env / .env.local
['.env.local', '.env'].forEach(f => {
  try {
    fs.readFileSync(path.join(__dirname, f), 'utf8').split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && v.length && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
    });
  } catch {}
});

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

// ─── Claude ───────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert general contractor estimator with 20+ years of experience in residential and light commercial construction. Your specialties include drywall, flooring, paint, trim work, door installation, windows, and general repairs.

You analyze photos of rooms and spaces and produce detailed, realistic construction estimates. You consider US market pricing for materials (current year) and standard labor times for an experienced crew.

You ALWAYS respond with valid JSON only — no markdown fences, no explanation text, just the raw JSON object. The JSON must exactly match the schema provided.

For materials: apply the provided markup percentage to base material costs before computing line_total. line_total = quantity * (unit_cost * (1 + markup/100)).
For labor: line_total = hours * rate.
Be specific about materials: include grade/quality tier, realistic quantities with correct units.`;

const SCHEMA = {
  scope_of_works: ["string — each identified repair or task"],
  materials: [{ item: "string", quantity: "number", unit: "string (e.g. sheets, gallons, LF, SF, EA)", unit_cost: "number (base cost before markup)", line_total: "number (with markup applied)" }],
  labor: [{ task: "string", hours: "number", rate: "number", line_total: "number" }],
  totals: { materials_subtotal: "number", labor_subtotal: "number", grand_total: "number" },
  estimate_notes: "string — caveats, assumptions, items needing closer inspection"
};

function callClaude(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); }
          catch { reject(new Error('Failed to parse Claude response')); }
        } else {
          reject(new Error(`Claude API error ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function buildCustomPricesText(customMaterials) {
  if (!customMaterials || !customMaterials.length) return '';
  return '\nCustom material prices to use:\n' +
    customMaterials.map(m => `- ${m.name}: $${m.cost} per ${m.unit}`).join('\n') + '\n';
}

function parseJSON(text) {
  const t = text.trim();
  try { return JSON.parse(t); }
  catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Claude did not return valid JSON. Please try again.');
  }
}

async function handleSingle(body) {
  const { imageBase64, mimeType, notes, laborRate, markupPct, customMaterials } = body;
  if (!imageBase64 || !mimeType) throw new Error('imageBase64 and mimeType are required');
  if (imageBase64.length > 5_000_000) throw new Error('Image too large. Use a smaller photo.');

  const rate = parseFloat(laborRate) || 75;
  const markup = parseFloat(markupPct) || 15;
  const notesText = notes ? `Additional notes: "${notes}"\n\n` : '';
  const customPricesText = buildCustomPricesText(customMaterials);

  const result = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
        { type: 'text', text: `Analyze this room photo and produce a construction estimate.\n\n${notesText}Settings:\n- Labor rate: $${rate}/hr\n- Material markup: ${markup}%\n${customPricesText}\nRespond ONLY with a JSON object matching this exact schema:\n\n${JSON.stringify(SCHEMA, null, 2)}` }
      ]
    }]
  });

  return parseJSON(result.content[0].text);
}

async function handleBatch(body) {
  const { images, roomName, notes, laborRate, markupPct, customMaterials } = body;
  if (!images || !images.length) throw new Error('images array is required');

  const rate = parseFloat(laborRate) || 75;
  const markup = parseFloat(markupPct) || 15;
  const roomLabel = roomName ? `Room: ${roomName}\n` : '';
  const notesText = notes ? `Additional notes: "${notes}"\n` : '';
  const customPricesText = buildCustomPricesText(customMaterials);

  const labeledContent = [];
  images.forEach((img, i) => {
    if (img.label) labeledContent.push({ type: 'text', text: `Photo ${i + 1}: ${img.label}` });
    labeledContent.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType || 'image/jpeg', data: img.base64 } });
  });

  labeledContent.push({
    type: 'text',
    text: `These ${images.length} photo${images.length !== 1 ? 's' : ''} are all from the same ${roomLabel.trim() || 'room'}. Analyze all of them together and produce a single unified construction estimate covering everything visible across all photos. Do not duplicate materials or labor tasks — combine into one estimate.\n\n${notesText}Settings:\n- Labor rate: $${rate}/hr\n- Material markup: ${markup}%\n${customPricesText}\nRespond ONLY with a JSON object matching this exact schema:\n\n${JSON.stringify(SCHEMA, null, 2)}`
  });

  const result = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: labeledContent }]
  });

  return parseJSON(result.content[0].text);
}

// ─── HTTP Server ──────────────────────────────────────────

const server = http.createServer((req, res) => {
  const pathname = url.parse(req.url).pathname;
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (pathname === '/api/analyze' || pathname === '/.netlify/functions/analyze') {
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }

    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const reqBody = JSON.parse(body);
        if (!process.env.ANTHROPIC_API_KEY) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set. Add it to your .env.local file.' }));
          return;
        }

        const action = reqBody.action || 'single';
        const estimate = action === 'batch' ? await handleBatch(reqBody) : await handleSingle(reqBody);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ estimate }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Analysis failed' }));
      }
    });
    return;
  }

  if (pathname === '/api/validate-license' || pathname === '/.netlify/functions/validate-license') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
      res.end(); return;
    }
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const secret = process.env.LICENSE_SECRET;
      if (!secret) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false, error: 'LICENSE_SECRET not set in .env.local' }));
        return;
      }
      let reqBody;
      try { reqBody = JSON.parse(body); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false, error: 'Invalid body' }));
        return;
      }
      const { email, code } = reqBody || {};
      if (!email || !code) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false, error: 'Email and code required' }));
        return;
      }
      const crypto = require('crypto');
      const norm = email.toLowerCase().trim();
      const expected = crypto.createHmac('sha256', secret).update(norm).digest('hex').substring(0, 16);
      const a = Buffer.from(code.toLowerCase().trim().padEnd(16, '\0'), 'utf8');
      const b = Buffer.from(expected.padEnd(16, '\0'), 'utf8');
      let valid = false;
      try { valid = a.length === b.length && crypto.timingSafeEqual(a, b); } catch {}
      if (valid) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: true, email: norm }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false, error: 'Invalid email or code' }));
      }
    });
    return;
  }

  // Static files
  let filePath = path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname);
  if (!path.extname(filePath)) filePath += '.html';

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found: ' + pathname); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ GC Estimator running at http://localhost:${PORT}`);
  console.log(`   API key: ${process.env.ANTHROPIC_API_KEY ? '✓ loaded' : '✗ missing — add to .env.local'}`);
  console.log(`\n   Phone access: http://192.168.0.88:${PORT}\n`);
});
