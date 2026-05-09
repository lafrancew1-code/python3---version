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

function buildCustomPricesText(customMaterials) {
  if (!customMaterials || !customMaterials.length) return '';
  return '\nCustom material prices to use:\n' +
    customMaterials.map(m => `- ${m.name}: $${m.cost} per ${m.unit}`).join('\n') + '\n';
}

function buildDimensionsText(dimensions) {
  if (!dimensions) return '';
  const { length, width, height } = dimensions;
  if (!length && !width && !height) return '';
  let text = '\nROOM MEASUREMENTS PROVIDED (use these for accurate material quantities):\n';
  if (length && width) {
    const floorArea = (length * width).toFixed(1);
    text += `- Floor area: ${length}ft × ${width}ft = ${floorArea} sq ft\n`;
    if (height) {
      const wallArea = (2 * (length + width) * height).toFixed(1);
      text += `- Wall area: ~${wallArea} sq ft (before subtracting doors/windows)\n`;
      text += `- Ceiling height: ${height}ft\n`;
    }
  } else {
    if (length) text += `- Length: ${length}ft\n`;
    if (width)  text += `- Width: ${width}ft\n`;
    if (height) text += `- Height: ${height}ft\n`;
  }
  text += 'Use these exact measurements to calculate material quantities instead of estimating from photos.\n';
  return text;
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
  const { images, roomName, notes, laborRate, markupPct, customMaterials, dimensions } = body;
  if (!images || !images.length) throw new Error('images array is required');

  const rate = parseFloat(laborRate) || 75;
  const markup = parseFloat(markupPct) || 15;
  const roomLabel = roomName ? `Room: ${roomName}\n` : '';
  const notesText = notes ? `Additional notes: "${notes}"\n` : '';
  const customPricesText = buildCustomPricesText(customMaterials);
  const dimensionsText = buildDimensionsText(dimensions);

  const labeledContent = [];
  images.forEach((img, i) => {
    if (img.label) labeledContent.push({ type: 'text', text: `Photo ${i + 1}: ${img.label}` });
    labeledContent.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType || 'image/jpeg', data: img.base64 } });
  });

  labeledContent.push({
    type: 'text',
    text: `These ${images.length} photo${images.length !== 1 ? 's' : ''} are all from the same ${roomLabel.trim() || 'room'}. Analyze all of them together and produce a single unified construction estimate covering everything visible across all photos. Do not duplicate materials or labor tasks — combine into one estimate.\n\n${dimensionsText}${notesText}Settings:\n- Labor rate: $${rate}/hr\n- Material markup: ${markup}%\n${customPricesText}\nRespond ONLY with a JSON object matching this exact schema:\n\n${JSON.stringify(SCHEMA, null, 2)}`
  });

  const result = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: labeledContent }]
  });

  return parseJSON(result.content[0].text);
}

// Vercel serverless function handler
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const action = body.action || 'single';
    const estimate = action === 'batch' ? await handleBatch(body) : await handleSingle(body);
    res.status(200).json({ estimate });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Analysis failed' });
  }
};
