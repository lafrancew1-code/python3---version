let capturedDataUrl = null;

// ─── Camera / Photo ───────────────────────────────────────

function triggerCamera() {
  document.getElementById('photoInput').click();
}

document.addEventListener('DOMContentLoaded', () => {
  refreshSettingsPreview();

  document.getElementById('photoInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
      capturedDataUrl = evt.target.result;
      const preview = document.getElementById('photoPreview');
      preview.src = capturedDataUrl;
      preview.style.display = 'block';
      document.getElementById('capturePlaceholder').style.display = 'none';
      document.getElementById('clearBtn').style.display = 'flex';
    };
    reader.readAsDataURL(file);
  });
});

function clearPhoto(e) {
  e.stopPropagation();
  capturedDataUrl = null;
  document.getElementById('photoInput').value = '';
  document.getElementById('photoPreview').style.display = 'none';
  document.getElementById('capturePlaceholder').style.display = 'flex';
  document.getElementById('clearBtn').style.display = 'none';
}

function refreshSettingsPreview() {
  const s = getSettings();
  document.getElementById('rateDisplay').textContent = '$' + s.laborRate + '/hr';
  document.getElementById('markupDisplay').textContent = s.markupPct + '%';
}

// ─── Image Compression ────────────────────────────────────

function compressImage(dataUrl, maxWidth, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function() {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve({ dataUrl: compressed, base64: compressed.split(',')[1], mimeType: 'image/jpeg' });
    };
    img.src = dataUrl;
  });
}

// ─── Analyze ──────────────────────────────────────────────

async function analyzePhoto() {
  if (!capturedDataUrl) {
    showToast('Please take or select a photo first', 'error');
    return;
  }

  const settings = getSettings();
  const notes = document.getElementById('notesInput').value.trim();
  const btn = document.getElementById('analyzeBtn');
  const overlay = document.getElementById('loadingOverlay');

  btn.disabled = true;
  overlay.classList.add('active');

  try {
    const { base64, mimeType, dataUrl: compressedDataUrl } =
      await compressImage(capturedDataUrl, 1600, 0.85);

    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType,
        notes,
        laborRate: settings.laborRate,
        markupPct: settings.markupPct
      })
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Server error ${response.status}`);

    const { estimate } = payload;

    // Build thumbnail for history
    const { dataUrl: thumbDataUrl } = await compressImage(capturedDataUrl, 200, 0.7);

    const record = {
      id: 'est_' + Date.now(),
      createdAt: new Date().toISOString(),
      notes,
      thumbnailDataUrl: thumbDataUrl,
      estimate,
      settings
    };

    sessionStorage.setItem('gc_pending_estimate', JSON.stringify(record));
    window.location.href = '/estimate.html';

  } catch (err) {
    const msg = err.message.includes('Failed to fetch')
      ? 'No connection — estimate requires internet'
      : err.message;
    showToast(msg, 'error');
    btn.disabled = false;
    overlay.classList.remove('active');
  }
}

// ─── Toast ────────────────────────────────────────────────

let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
}
