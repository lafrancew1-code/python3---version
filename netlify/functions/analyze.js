const https = require('https');

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

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const action = body.action || 'single';

  try {
    let estimate;
    if (action === 'batch') {
      estimate = await handleBatch(body);
    } else {
      estimate = await handleSingle(body);
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estimate })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Analysis failed' })
    };
  }
};

// ─── Single photo ─────────────────────────────────────────

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

// ─── Batch (multiple photos, one unified estimate) ────────

async function handleBatch(body) {
  const { images, roomName, notes, laborRate, markupPct, customMaterials } = body;

  if (!images || !images.length) throw new Error('images array is required');

  // Validate sizes
  for (const img of images) {
    if (img.base64 && img.base64.length > 5_000_000) throw new Error('One or more images are too large.');
  }

  const rate = parseFloat(laborRate) || 75;
  const markup = parseFloat(markupPct) || 15;
  const roomLabel = roomName ? `Room: ${roomName}\n` : '';
  const notesText = notes ? `Additional notes: "${notes}"\n` : '';
  const customPricesText = buildCustomPricesText(customMaterials);

  // Build content array: all images + one text prompt
  const content = images.map((img, i) => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mimeType || 'image/jpeg', data: img.base64 }
  }));

  // Add labels as text before each image if provided (interleaved)
  const labeledContent = [];
  images.forEach((img, i) => {
    if (img.label) {
      labeledContent.push({ type: 'text', text: `Photo ${i + 1}${img.label ? ': ' + img.label : ''}` });
    }
    labeledContent.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType || 'image/jpeg', data: img.base64 } });
  });

  labeledContent.push({
    type: 'text',
    text: `These ${images.length} photo${images.length !== 1 ? 's' : ''} are all from the same ${roomLabel.trim() || 'room'}. Analyze all of them together and produce a single unified construction estimate covering everything visible across all photos. Do not duplicate materials or labor tasks that appear in multiple photos — combine them into one estimate.\n\n${notesText}Settings:\n- Labor rate: $${rate}/hr\n- Material markup: ${markup}%\n${customPricesText}\nRespond ONLY with a JSON object matching this exact schema:\n\n${JSON.stringify(SCHEMA, null, 2)}`
  });

  const result = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: labeledContent }]
  });

  return parseJSON(result.content[0].text);
}

// ─── Helpers ──────────────────────────────────────────────

function buildCustomPricesText(customMaterials) {
  if (!customMaterials || !customMaterials.length) return '';
  return '\nCustom material prices to use:\n' +
    customMaterials.map(m => `- ${m.name}: $${m.cost} per ${m.unit}`).join('\n') + '\n';
}

function parseJSON(text) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); }
  catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Claude did not return valid JSON. Please try again.');
  }
}

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
        'anthropic-version': '2023-06-01'
      }
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
