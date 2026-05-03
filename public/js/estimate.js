const params = new URLSearchParams(window.location.search);
const estType = params.get('type');       // 'photo' | 'room' | 'project' | 'project-breakdown'
const projectId = params.get('projectId');
const roomId = params.get('roomId');
const photoId = params.get('photoId');

document.addEventListener('DOMContentLoaded', () => {
  if (!isPaid()) document.getElementById('materialsNavLink').classList.add('nav-locked');

  if (estType === 'photo') renderPhotoEstimate();
  else if (estType === 'room') renderRoomEstimate();
  else if (estType === 'project') renderProjectEstimate(false);
  else if (estType === 'project-breakdown') renderProjectEstimate(true);
  else document.getElementById('estimateContent').innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Unknown estimate type.</p></div>';
});

// ─── Photo Estimate ───────────────────────────────────────

function renderPhotoEstimate() {
  const project = getProjectById(projectId);
  const room = getRoomById(projectId, roomId);
  const photo = room?.photos.find(p => p.id === photoId);

  if (!photo) { notFound(); return; }

  document.getElementById('backBtn').href = `/room.html?projectId=${projectId}&roomId=${roomId}`;
  document.getElementById('pageTitle').textContent = photo.label || 'Photo Estimate';

  renderEstimateBody({
    estimate: photo.estimate,
    settings: photo.settings || getSettings(),
    headline: `${project?.name} › ${room?.name} › ${photo.label || 'Photo'}`,
    createdAt: photo.createdAt,
    notes: photo.notes,
    scope: 'photo'
  });
}

// ─── Room Estimate ────────────────────────────────────────

function renderRoomEstimate() {
  const project = getProjectById(projectId);
  const room = getRoomById(projectId, roomId);
  if (!room || room.photos.length === 0) { notFound(); return; }

  document.getElementById('backBtn').href = `/room.html?projectId=${projectId}&roomId=${roomId}`;
  document.getElementById('pageTitle').textContent = room.name + ' Estimate';

  // Prefer the unified room estimate from batch analysis if available
  const agg = room.roomEstimate || aggregateEstimates(room.photos);
  const settings = getSettings();

  renderEstimateBody({
    estimate: agg,
    settings,
    headline: `${project?.name} › ${room.name}`,
    createdAt: new Date().toISOString(),
    notes: `Compiled from ${room.photos.length} photo${room.photos.length !== 1 ? 's' : ''}.`,
    scope: 'room',
    showSourceTags: true
  });
}

// ─── Project Estimate ─────────────────────────────────────

function renderProjectEstimate(breakdown) {
  const project = getProjectById(projectId);
  if (!project) { notFound(); return; }

  document.getElementById('backBtn').href = `/project.html?id=${projectId}`;
  document.getElementById('pageTitle').textContent = breakdown ? 'Estimate by Room' : 'Full Project Estimate';

  const settings = getSettings();

  if (breakdown) {
    // Room-by-room breakdown
    let html = exportButtons(null, settings, true) + `<div class="est-meta">📋 ${project.name}</div>`;

    let grandMat = 0, grandLab = 0;

    project.rooms.forEach(room => {
      if (room.photos.length === 0) return;
      const agg = room.roomEstimate || aggregateEstimates(room.photos);
      grandMat += agg.totals.materials_subtotal;
      grandLab += agg.totals.labor_subtotal;
      html += `
        <div class="room-section-header" style="display:flex;justify-content:space-between;align-items:center;">
          <span>🚪 ${escHtml(room.name)}</span>
          <a href="/estimate.html?type=room&projectId=${projectId}&roomId=${room.id}"
            class="btn btn-outline btn-sm" style="font-size:0.7rem;">✏️ Edit</a>
        </div>`;
      html += estimateCards(agg, settings, false, false);
    });

    html += `
      <div class="totals-box">
        <div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;opacity:0.7;margin-bottom:8px;">Full Project</div>
        <div class="totals-row"><span>Materials</span><span>${formatMoney(grandMat)}</span></div>
        <div class="totals-row"><span>Labor</span><span>${formatMoney(grandLab)}</span></div>
        <div class="totals-row grand"><span>GRAND TOTAL</span><span>${formatMoney(grandMat + grandLab)}</span></div>
      </div>`;

    html += `<div style="height:16px;"></div>`;
    document.getElementById('estimateContent').innerHTML = html;
    window._exportContext = { project, settings, breakdown: true };

  } else {
    // All photos merged into one estimate
    const allPhotos = project.rooms.flatMap(r => r.photos);
    const agg = aggregateEstimates(allPhotos);
    const photoCount = allPhotos.length;
    renderEstimateBody({
      estimate: agg,
      settings,
      headline: project.name,
      createdAt: new Date().toISOString(),
      notes: `Compiled from ${project.rooms.length} rooms, ${photoCount} photos.`,
      scope: 'project'
    });
    window._exportContext = { project, settings, breakdown: false };
  }
}

// ─── Render Estimate Body ─────────────────────────────────

function renderEstimateBody({ estimate, settings, headline, createdAt, notes, scope, showSourceTags }) {
  window._exportContext = { estimate, settings, headline, createdAt, notes };
  window._renderContext = { estimate, settings, headline, createdAt, notes, scope, showSourceTags };

  const allowEdit = scope === 'photo' || scope === 'room';
  const content = document.getElementById('estimateContent');
  content.innerHTML =
    exportButtons(estimate, settings) +
    `<div class="est-meta"><span>📋 ${escHtml(headline)}</span></div>` +
    estimateCards(estimate, settings, showSourceTags, allowEdit) +
    `<div style="height:16px;"></div>`;
}

function rerenderEstimate() {
  const ctx = window._renderContext;
  if (!ctx) return;
  ctx.estimate = window._exportContext.estimate;
  renderEstimateBody(ctx);
}

function estimateCards(estimate, settings, showSourceTags, allowEdit) {
  const paid = isPaid();
  let html = '';

  // Scope of works
  const scopeItems = estimate.scope_of_works || [];
  let scopeRows = '';
  if (scopeItems.length === 0) {
    scopeRows = '<li style="color:var(--ink2)">No scope items.</li>';
  } else {
    scopeRows = scopeItems.map((s, i) => allowEdit
      ? `<li class="scope-item" id="scope_item_${i}">
          <span>${escHtml(s)}</span>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button class="scope-del" onclick="editScopeItem(${i})" aria-label="Edit" style="color:var(--ink2);">✏️</button>
            <button class="scope-del" onclick="removeScopeItem(${i})" aria-label="Remove">✕</button>
          </div>
        </li>`
      : `<li>${escHtml(s)}</li>`
    ).join('');
  }
  html += `
    <div class="card">
      <div class="card-title">Scope of Works</div>
      <ul class="scope-list" id="scopeList">${scopeRows}</ul>
      ${allowEdit ? `<div class="scope-add-row">
        <input type="text" id="scopeInput" class="form-input" placeholder="Add scope item…"
          style="margin-bottom:0;" onkeydown="if(event.key==='Enter')addScopeItem()">
        <button class="btn btn-secondary btn-sm" onclick="addScopeItem()">Add</button>
      </div>` : ''}
    </div>`;

  // Materials
  if (paid) {
    const matLabelSpan = (showSourceTags ? 3 : 2) + (allowEdit ? 1 : 0);
    html += `
      <div class="card">
        <div class="card-title">Materials</div>
        <div style="overflow-x:auto;">
          <table class="est-table">
            <thead><tr>
              <th>Item</th>
              ${showSourceTags ? '<th>Area</th>' : ''}
              <th style="text-align:right">Qty</th>
              <th style="text-align:right">Unit $</th>
              <th style="text-align:right">Total</th>
              ${allowEdit ? '<th></th>' : ''}
            </tr></thead>
            <tbody>
              ${(estimate.materials || []).map((m, i) => `
                <tr id="mat_row_${i}">
                  <td>${escHtml(m.item)}<br><small style="color:var(--ink2)">${escHtml(m.unit)}</small></td>
                  ${showSourceTags ? `<td><span class="source-tag">${escHtml(m._source||'')}</span></td>` : ''}
                  <td style="text-align:right">${m.quantity}</td>
                  <td style="text-align:right">${formatMoney(m.unit_cost)}</td>
                  <td style="text-align:right"><strong>${formatMoney(m.line_total)}</strong></td>
                  ${allowEdit ? `<td style="width:28px;"><button class="scope-del" onclick="editMaterialRow(${i})" aria-label="Edit" style="color:var(--ink2);font-size:0.85rem;">✏️</button></td>` : ''}
                </tr>`).join('')}
              <tr class="subtotal-row">
                <td colspan="${matLabelSpan}">Materials Subtotal</td>
                <td>${formatMoney(estimate.totals?.materials_subtotal)}</td>
                ${allowEdit ? '<td></td>' : ''}
              </tr>
            </tbody>
          </table>
        </div>
        <div style="font-size:0.75rem;color:var(--ink2);margin-top:6px;">Includes ${settings.markupPct}% markup</div>
      </div>`;
  } else {
    html += `
      <div class="card upgrade-card">
        <div class="card-title">Materials Breakdown</div>
        <div class="upgrade-lock">
          <div class="upgrade-icon">🔒</div>
          <div class="upgrade-text">Itemized materials list is a <strong>Pro feature</strong>.</div>
          <a href="/settings.html" class="btn btn-primary" style="width:auto;padding:10px 20px;font-size:0.9rem;">Upgrade to Pro →</a>
        </div>
      </div>`;
  }

  // Labor — recalculate totals using current settings rate (visible to all users)
  {
    const defaultRate = settings.laborRate;
    let laborSub = 0;
    const laborRows = (estimate.labor || []).map((l, i) => {
      const rate = (l._customRate != null) ? l._customRate : defaultRate;
      const lineTotal = parseFloat((l.hours * rate).toFixed(2));
      laborSub += lineTotal;
      if (allowEdit) {
        return `<tr id="labor_row_${i}">
          <td>${escHtml(l.task)}</td>
          ${showSourceTags ? `<td><span class="source-tag">${escHtml(l._source||'')}</span></td>` : ''}
          <td style="text-align:right">${l.hours}</td>
          <td style="text-align:right">${formatMoney(rate)}/hr</td>
          <td style="text-align:right"><strong>${formatMoney(lineTotal)}</strong></td>
          <td style="width:28px;"><button class="scope-del" onclick="editLaborRow(${i})" aria-label="Edit" style="color:var(--ink2);font-size:0.85rem;">✏️</button></td>
        </tr>`;
      }
      return `<tr>
        <td>${escHtml(l.task)}</td>
        ${showSourceTags ? `<td><span class="source-tag">${escHtml(l._source||'')}</span></td>` : ''}
        <td style="text-align:right">${l.hours}</td>
        <td style="text-align:right">${formatMoney(rate)}/hr</td>
        <td style="text-align:right"><strong>${formatMoney(lineTotal)}</strong></td>
      </tr>`;
    }).join('');

    // Keep totals in sync with displayed values
    if (estimate.totals) {
      estimate.totals.labor_subtotal = laborSub;
      estimate.totals.grand_total = (estimate.totals.materials_subtotal || 0) + laborSub;
    }

    const labelSpan = (showSourceTags ? 3 : 2) + (allowEdit ? 1 : 0);
    html += `
      <div class="card">
        <div class="card-title">Labor</div>
        <div style="overflow-x:auto;">
          <table class="est-table" id="laborTable">
            <thead><tr>
              <th>Task</th>
              ${showSourceTags ? '<th>Area</th>' : ''}
              <th style="text-align:right">Hrs</th>
              <th style="text-align:right">Rate</th>
              <th style="text-align:right">Total</th>
              ${allowEdit ? '<th></th>' : ''}
            </tr></thead>
            <tbody>
              ${laborRows}
              <tr class="subtotal-row">
                <td colspan="${labelSpan}">Labor Subtotal</td>
                <td>${formatMoney(laborSub)}</td>
                ${allowEdit ? '<td></td>' : ''}
              </tr>
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // Totals (always visible)
  html += `
    <div class="totals-box">
      <div class="totals-row"><span>Materials</span><span>${formatMoney(estimate.totals?.materials_subtotal)}</span></div>
      <div class="totals-row"><span>Labor</span><span>${formatMoney(estimate.totals?.labor_subtotal)}</span></div>
      <div class="totals-row grand"><span>GRAND TOTAL</span><span>${formatMoney(estimate.totals?.grand_total)}</span></div>
    </div>`;

  if (estimate.estimate_notes) {
    html += `<div class="section-gap"></div><div class="notes-box"><strong>⚠️ Notes</strong><br>${escHtml(estimate.estimate_notes)}</div>`;
  }

  return html;
}

// ─── Scope Editing ────────────────────────────────────────

function editScopeItem(index) {
  const s = window._exportContext.estimate.scope_of_works[index];
  const li = document.getElementById('scope_item_' + index);
  if (!li) return;
  li.innerHTML = `
    <input type="text" id="scope_text_${index}" class="form-input" value="${escHtml(s)}"
      style="flex:1;margin-bottom:0;" onkeydown="if(event.key==='Enter')saveScopeItemText(${index})">
    <div style="display:flex;gap:4px;flex-shrink:0;margin-left:6px;">
      <button class="btn btn-primary btn-sm" onclick="saveScopeItemText(${index})">✓</button>
      <button class="btn btn-outline btn-sm" onclick="rerenderEstimate()">✕</button>
    </div>`;
  document.getElementById('scope_text_' + index)?.focus();
}

function saveScopeItemText(index) {
  const input = document.getElementById('scope_text_' + index);
  const text = input?.value.trim();
  if (!text) { showToast('Enter scope text', 'error'); return; }
  const scope = [...(window._exportContext.estimate.scope_of_works || [])];
  scope[index] = text;
  saveScopeEdits(scope);
}

function removeScopeItem(index) {
  const scope = [...(window._exportContext.estimate.scope_of_works || [])];
  scope.splice(index, 1);
  saveScopeEdits(scope);
}

function addScopeItem() {
  const input = document.getElementById('scopeInput');
  const text = input.value.trim();
  if (!text) return;
  const scope = [...(window._exportContext.estimate.scope_of_works || []), text];
  input.value = '';
  saveScopeEdits(scope);
}

function saveScopeEdits(newScope) {
  window._exportContext.estimate.scope_of_works = newScope;

  if (estType === 'room') {
    const room = getRoomById(projectId, roomId);
    if (room?.roomEstimate) {
      updateRoom(projectId, roomId, { roomEstimate: { ...room.roomEstimate, scope_of_works: newScope } });
    }
  } else if (estType === 'photo') {
    const room = getRoomById(projectId, roomId);
    const photo = room?.photos.find(p => p.id === photoId);
    if (photo?.estimate) {
      updateRoomPhoto(projectId, roomId, photoId, { estimate: { ...photo.estimate, scope_of_works: newScope } });
    }
  }

  // Re-render the list in-place
  const list = document.getElementById('scopeList');
  if (!list) return;
  if (newScope.length === 0) {
    list.innerHTML = '<li style="color:var(--ink2)">No scope items.</li>';
  } else {
    list.innerHTML = newScope.map((s, i) =>
      `<li class="scope-item"><span>${escHtml(s)}</span><button class="scope-del" onclick="removeScopeItem(${i})" aria-label="Remove">✕</button></li>`
    ).join('');
  }
  showToast('Saved', 'success');
}

// ─── Labor Editing ────────────────────────────────────────

function editLaborRow(index) {
  const l = window._exportContext.estimate.labor[index];
  const defaultRate = (window._renderContext?.settings || getSettings()).laborRate;
  const currentRate = l._customRate != null ? l._customRate : defaultRate;
  const row = document.getElementById('labor_row_' + index);
  if (!row) return;
  const colCount = row.cells.length;
  row.innerHTML = `<td colspan="${colCount}" style="padding:10px 4px;">
    <div style="font-size:0.8rem;font-weight:600;margin-bottom:8px;color:var(--ink);">${escHtml(l.task)}</div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:6px;">
        <label style="font-family:var(--font-mono);font-size:0.7rem;color:var(--ink2);">HRS</label>
        <input type="number" id="edit_hours_${index}" value="${l.hours}" min="0" step="0.5" inputmode="decimal"
          style="width:68px;font-family:var(--font-mono);font-size:0.9rem;padding:6px 8px;border:1px solid var(--hairline);border-radius:8px;text-align:right;">
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <label style="font-family:var(--font-mono);font-size:0.7rem;color:var(--ink2);">$/HR</label>
        <input type="number" id="edit_rate_${index}" value="${currentRate}" min="0" step="1" inputmode="decimal"
          style="width:76px;font-family:var(--font-mono);font-size:0.9rem;padding:6px 8px;border:1px solid var(--hairline);border-radius:8px;text-align:right;">
      </div>
      <button class="btn btn-primary btn-sm" onclick="saveLaborEdit(${index})">Save</button>
      <button class="btn btn-outline btn-sm" onclick="rerenderEstimate()">✕</button>
    </div>
  </td>`;
}

function saveLaborEdit(index) {
  const hours = parseFloat(document.getElementById('edit_hours_' + index)?.value);
  const rate  = parseFloat(document.getElementById('edit_rate_' + index)?.value);
  if (isNaN(hours) || hours < 0) { showToast('Enter valid hours', 'error'); return; }
  if (isNaN(rate)  || rate  < 0) { showToast('Enter valid rate',  'error'); return; }

  const ctx = window._exportContext;
  const settings = getSettings();
  const defaultRate = settings.laborRate;

  ctx.estimate.labor[index] = {
    ...ctx.estimate.labor[index],
    hours,
    rate,
    _customRate: rate !== defaultRate ? rate : undefined,
    line_total: parseFloat((hours * rate).toFixed(2)),
  };

  // Recalculate totals explicitly
  let newLaborSub = 0;
  ctx.estimate.labor.forEach(l => {
    const r = (l._customRate != null) ? l._customRate : defaultRate;
    newLaborSub += l.hours * r;
  });
  newLaborSub = parseFloat(newLaborSub.toFixed(2));
  const matSub = ctx.estimate.totals?.materials_subtotal || 0;
  if (!ctx.estimate.totals) ctx.estimate.totals = {};
  ctx.estimate.totals.labor_subtotal = newLaborSub;
  ctx.estimate.totals.grand_total = parseFloat((matSub + newLaborSub).toFixed(2));

  // Persist labor + updated totals to localStorage
  if (estType === 'room') {
    const room = getRoomById(projectId, roomId);
    if (room?.roomEstimate) updateRoom(projectId, roomId, {
      roomEstimate: { ...room.roomEstimate, labor: ctx.estimate.labor, totals: ctx.estimate.totals }
    });
  } else if (estType === 'photo') {
    const room = getRoomById(projectId, roomId);
    const photo = room?.photos.find(p => p.id === photoId);
    if (photo?.estimate) updateRoomPhoto(projectId, roomId, photoId, {
      estimate: { ...photo.estimate, labor: ctx.estimate.labor, totals: ctx.estimate.totals }
    });
  }

  rerenderEstimate();
  showToast('Updated', 'success');
}

// ─── Material Editing ─────────────────────────────────────

function editMaterialRow(index) {
  const m = window._exportContext.estimate.materials[index];
  const row = document.getElementById('mat_row_' + index);
  if (!row) return;
  const colCount = row.cells.length;
  row.innerHTML = `<td colspan="${colCount}" style="padding:10px 4px;">
    <div style="font-size:0.8rem;font-weight:600;margin-bottom:8px;color:var(--ink);">${escHtml(m.item)} <small style="color:var(--ink2);font-weight:400;">${escHtml(m.unit)}</small></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:6px;">
        <label style="font-family:var(--font-mono);font-size:0.7rem;color:var(--ink2);">QTY</label>
        <input type="number" id="mat_qty_${index}" value="${m.quantity}" min="0" step="0.1" inputmode="decimal"
          style="width:72px;font-family:var(--font-mono);font-size:0.9rem;padding:6px 8px;border:1px solid var(--hairline);border-radius:8px;text-align:right;">
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <label style="font-family:var(--font-mono);font-size:0.7rem;color:var(--ink2);">UNIT $</label>
        <input type="number" id="mat_cost_${index}" value="${m.unit_cost}" min="0" step="0.01" inputmode="decimal"
          style="width:80px;font-family:var(--font-mono);font-size:0.9rem;padding:6px 8px;border:1px solid var(--hairline);border-radius:8px;text-align:right;">
      </div>
      <button class="btn btn-primary btn-sm" onclick="saveMaterialEdit(${index})">Save</button>
      <button class="btn btn-outline btn-sm" onclick="rerenderEstimate()">✕</button>
    </div>
  </td>`;
}

function saveMaterialEdit(index) {
  const qty  = parseFloat(document.getElementById('mat_qty_' + index)?.value);
  const cost = parseFloat(document.getElementById('mat_cost_' + index)?.value);
  if (isNaN(qty)  || qty  < 0) { showToast('Enter valid quantity',   'error'); return; }
  if (isNaN(cost) || cost < 0) { showToast('Enter valid unit cost',  'error'); return; }

  const ctx    = window._exportContext;
  const markup = (window._renderContext?.settings || getSettings()).markupPct;
  const lineTotal = parseFloat((qty * cost * (1 + markup / 100)).toFixed(2));

  ctx.estimate.materials[index] = {
    ...ctx.estimate.materials[index],
    quantity: qty,
    unit_cost: cost,
    line_total: lineTotal,
  };

  // Recalculate materials subtotal + grand total
  let matSub = 0;
  ctx.estimate.materials.forEach(m => { matSub += m.line_total; });
  matSub = parseFloat(matSub.toFixed(2));
  const labSub = ctx.estimate.totals?.labor_subtotal || 0;
  if (!ctx.estimate.totals) ctx.estimate.totals = {};
  ctx.estimate.totals.materials_subtotal = matSub;
  ctx.estimate.totals.grand_total = parseFloat((matSub + labSub).toFixed(2));

  // Persist to localStorage
  if (estType === 'room') {
    const room = getRoomById(projectId, roomId);
    if (room?.roomEstimate) updateRoom(projectId, roomId, {
      roomEstimate: { ...room.roomEstimate, materials: ctx.estimate.materials, totals: ctx.estimate.totals }
    });
  } else if (estType === 'photo') {
    const room = getRoomById(projectId, roomId);
    const photo = room?.photos.find(p => p.id === photoId);
    if (photo?.estimate) updateRoomPhoto(projectId, roomId, photoId, {
      estimate: { ...photo.estimate, materials: ctx.estimate.materials, totals: ctx.estimate.totals }
    });
  }

  rerenderEstimate();
  showToast('Updated', 'success');
}

function exportButtons(estimate, settings, isBreakdown) {
  const pdfBtn = isPaid()
    ? `<button class="btn btn-primary btn-sm" onclick="doExportPDF()">📄 Export PDF</button>`
    : `<button class="btn btn-outline btn-sm" style="opacity:0.5" onclick="showToast('PDF export is a Pro feature — upgrade in Settings','error')">📄 PDF (Pro)</button>`;
  return `
    <div class="export-row" style="margin-bottom:14px;">
      ${pdfBtn}
      <button class="btn btn-secondary btn-sm" onclick="doExportCSV()">⬇️ CSV</button>
      <button class="btn btn-outline btn-sm" onclick="doCopyText()">📋 Copy</button>
    </div>`;
}

// ─── Export ───────────────────────────────────────────────

function doExportPDF() {
  if (!isPaid()) { showToast('PDF export is a Pro feature', 'error'); return; }
  const ctx = window._exportContext;
  if (!ctx) return;

  const { jsPDF } = window.jspdf;
  if (!jsPDF) { showToast('PDF library not loaded — check connection', 'error'); return; }

  const { estimate, headline } = ctx;
  const settings = getSettings();
  const companyName = settings.contractorName || 'FieldEstimate';
  const dateStr = formatDate(new Date().toISOString());

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const PW = 215.9;  // page width
  const PH = 279.4;  // page height
  const ML = 18;     // margin left
  const MR = 18;     // margin right
  const CW = PW - ML - MR; // content width

  const DARK   = [12, 30, 16];
  const ORANGE = [255, 106, 0];
  const WHITE  = [255, 255, 255];
  const INK    = [20, 20, 20];
  const GREY   = [110, 110, 110];
  const LGREY  = [230, 230, 230];
  const BGBOX  = [245, 243, 238];

  let y = 0;

  // ── header bar ──────────────────────────────────────────
  doc.setFillColor(...DARK);
  doc.rect(0, 0, PW, 36, 'F');

  // orange accent line at bottom of header
  doc.setFillColor(...ORANGE);
  doc.rect(0, 34, PW, 2, 'F');

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(companyName.toUpperCase(), ML, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 200, 185);
  doc.text('CONSTRUCTION ESTIMATE', ML, 23);

  doc.setTextColor(...WHITE);
  doc.setFontSize(9);
  doc.text(dateStr, PW - MR, 15, { align: 'right' });
  doc.setFontSize(8);
  doc.setTextColor(180, 200, 185);
  doc.text('fieldestimator.vercel.app', PW - MR, 23, { align: 'right' });

  y = 48;

  // ── job headline ─────────────────────────────────────────
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(headline, ML, y);
  y += 4;

  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.6);
  doc.line(ML, y, PW - MR, y);
  y += 8;

  // ── helper: section header ───────────────────────────────
  function sectionHeader(title) {
    checkPage(12);
    doc.setFillColor(...DARK);
    doc.rect(ML, y - 4, CW, 8, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(title, ML + 3, y + 0.5);
    y += 8;
    doc.setTextColor(...INK);
  }

  // ── helper: page overflow check ──────────────────────────
  function checkPage(needed) {
    if (y + needed > PH - 25) {
      doc.addPage();
      y = 20;
    }
  }

  // ── helper: table row ────────────────────────────────────
  function tableRow(cols, widths, isHeader, shade) {
    checkPage(8);
    if (shade) {
      doc.setFillColor(...BGBOX);
      doc.rect(ML, y - 4.5, CW, 7, 'F');
    }
    doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
    doc.setFontSize(isHeader ? 8 : 9);
    doc.setTextColor(...(isHeader ? GREY : INK));
    let x = ML;
    cols.forEach((col, i) => {
      const align = i > 0 ? 'right' : 'left';
      const xPos = align === 'right' ? x + widths[i] : x;
      doc.text(String(col), xPos, y, { align });
      x += widths[i];
    });
    y += 7;
  }

  // ── SCOPE OF WORKS ───────────────────────────────────────
  sectionHeader('SCOPE OF WORKS');
  y += 2;
  const scope = estimate.scope_of_works || [];
  if (scope.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...GREY);
    doc.text('No scope items.', ML + 3, y);
    y += 7;
  } else {
    scope.forEach((item, i) => {
      checkPage(8);
      const lines = doc.splitTextToSize(`${i + 1}.  ${item}`, CW - 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      if (i % 2 === 0) {
        doc.setFillColor(...BGBOX);
        doc.rect(ML, y - 4.5, CW, lines.length * 5 + 3, 'F');
      }
      doc.text(lines, ML + 3, y);
      y += lines.length * 5 + 2;
    });
  }
  y += 4;

  // ── LABOR ────────────────────────────────────────────────
  const laborItems = estimate.labor || [];
  if (laborItems.length > 0) {
    sectionHeader('LABOR');
    y += 2;
    const lW = [CW * 0.48, CW * 0.18, CW * 0.18, CW * 0.16];
    tableRow(['Task', 'Hours', 'Rate', 'Total'], lW, true, false);
    doc.setDrawColor(...LGREY);
    doc.setLineWidth(0.3);
    doc.line(ML, y - 4, PW - MR, y - 4);
    let laborSub = 0;
    laborItems.forEach((l, i) => {
      const rate = l._customRate != null ? l._customRate : settings.laborRate;
      const total = parseFloat((l.hours * rate).toFixed(2));
      laborSub += total;
      tableRow([l.task, `${l.hours} hrs`, `$${rate}/hr`, formatMoney(total)], lW, false, i % 2 === 0);
    });
    doc.setDrawColor(...LGREY);
    doc.line(ML, y - 3, PW - MR, y - 3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text('Labor Subtotal', ML + 3, y + 2);
    doc.text(formatMoney(laborSub), PW - MR, y + 2, { align: 'right' });
    y += 10;
  }

  // ── MATERIALS ────────────────────────────────────────────
  const matItems = estimate.materials || [];
  if (matItems.length > 0) {
    sectionHeader('MATERIALS');
    y += 2;
    const mW = [CW * 0.42, CW * 0.15, CW * 0.15, CW * 0.15, CW * 0.13];
    tableRow(['Item', 'Unit', 'Qty', 'Unit $', 'Total'], mW, true, false);
    doc.setDrawColor(...LGREY);
    doc.setLineWidth(0.3);
    doc.line(ML, y - 4, PW - MR, y - 4);
    let matSub = 0;
    matItems.forEach((m, i) => {
      matSub += m.line_total;
      tableRow([m.item, m.unit, String(m.quantity), formatMoney(m.unit_cost), formatMoney(m.line_total)], mW, false, i % 2 === 0);
    });
    doc.setDrawColor(...LGREY);
    doc.line(ML, y - 3, PW - MR, y - 3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text(`Materials Subtotal  (incl. ${settings.markupPct}% markup)`, ML + 3, y + 2);
    doc.text(formatMoney(matSub), PW - MR, y + 2, { align: 'right' });
    y += 12;
  }

  // ── TOTALS BOX ───────────────────────────────────────────
  checkPage(40);
  const boxH = 36;
  doc.setFillColor(...DARK);
  doc.roundedRect(ML, y, CW, boxH, 3, 3, 'F');
  doc.setFillColor(...ORANGE);
  doc.roundedRect(ML, y, CW, 10, 3, 3, 'F');
  doc.rect(ML, y + 5, CW, 5, 'F');

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('ESTIMATE SUMMARY', ML + 6, y + 7);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 200, 185);
  const matSub2 = estimate.totals?.materials_subtotal || 0;
  const labSub2 = estimate.totals?.labor_subtotal || 0;
  const grand   = estimate.totals?.grand_total || 0;
  doc.text('Materials', ML + 6, y + 18);
  doc.text(formatMoney(matSub2), PW - MR - 2, y + 18, { align: 'right' });
  doc.text('Labor', ML + 6, y + 25);
  doc.text(formatMoney(labSub2), PW - MR - 2, y + 25, { align: 'right' });

  doc.setDrawColor(60, 90, 65);
  doc.setLineWidth(0.4);
  doc.line(ML + 4, y + 27, PW - MR - 4, y + 27);

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('GRAND TOTAL', ML + 6, y + 33);
  doc.text(formatMoney(grand), PW - MR - 2, y + 33, { align: 'right' });
  y += boxH + 8;

  // ── NOTES ────────────────────────────────────────────────
  if (estimate.estimate_notes) {
    checkPage(20);
    doc.setFillColor(255, 248, 220);
    const noteLines = doc.splitTextToSize(estimate.estimate_notes, CW - 10);
    const noteH = noteLines.length * 5 + 12;
    doc.roundedRect(ML, y, CW, noteH, 2, 2, 'F');
    doc.setTextColor(120, 80, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('⚠  Notes & Assumptions', ML + 4, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(noteLines, ML + 4, y + 13);
    y += noteH + 6;
  }

  // ── footer ────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(...DARK);
    doc.rect(0, PH - 12, PW, 12, 'F');
    doc.setTextColor(140, 160, 145);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Generated by FieldEstimate · fieldestimator.vercel.app · Estimates are approximate — review before presenting to clients.', ML, PH - 5);
    doc.text(`Page ${p} of ${totalPages}`, PW - MR, PH - 5, { align: 'right' });
  }

  // ── save ─────────────────────────────────────────────────
  const filename = `estimate_${headline.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.pdf`;
  doc.save(filename);
  showToast('PDF downloaded!', 'success');
}

function doExportCSV() {
  const ctx = window._exportContext;
  if (!ctx) return;
  const paid = isPaid();

  let csv = '';
  const q = v => { const s = String(v==null?'':v); return (s.includes(',')||s.includes('"')||s.includes('\n')) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  const row = cols => cols.map(q).join(',') + '\n';

  if (ctx.breakdown) {
    csv += row(['FULL PROJECT ESTIMATE — BY ROOM']);
    csv += row(['Job', ctx.project.name]);
    csv += row(['Date', formatDate(new Date().toISOString())]);
    csv += row([]);
    ctx.project.rooms.forEach(room => {
      if (!room.photos.length) return;
      const agg = aggregateEstimates(room.photos);
      csv += row(['ROOM: ' + room.name]);
      csv += row(['Scope of Works']);
      agg.scope_of_works.forEach((s, i) => { csv += row([i+1+'.', s]); });
      if (paid) {
        csv += row([]);
        csv += row(['MATERIALS','Qty','Unit','Unit Cost','Line Total']);
        agg.materials.forEach(m => { csv += row([m.item, m.quantity, m.unit, m.unit_cost, m.line_total]); });
        csv += row(['Labor']);
        agg.labor.forEach(l => { csv += row([l.task, l.hours + ' hrs', '$'+l.rate+'/hr', '', l.line_total]); });
      }
      csv += row(['Room Total','','','', agg.totals.grand_total]);
      csv += row([]);
    });
    const t = projectTotals(ctx.project);
    csv += row(['GRAND TOTAL','','','', t.grand_total]);
  } else {
    const { estimate, settings, headline } = ctx;
    csv += row(['CONSTRUCTION ESTIMATE']);
    csv += row(['Job', headline]);
    csv += row(['Date', formatDate(new Date().toISOString())]);
    csv += row([]);
    csv += row(['SCOPE OF WORKS']);
    (estimate.scope_of_works||[]).forEach((s,i) => { csv += row([i+1+'.', s]); });
    csv += row([]);
    if (paid) {
      csv += row(['MATERIALS','Qty','Unit','Unit Cost','Line Total']);
      (estimate.materials||[]).forEach(m => { csv += row([m.item, m.quantity, m.unit, m.unit_cost, m.line_total]); });
      csv += row(['Materials Subtotal','','','', estimate.totals?.materials_subtotal||0]);
      csv += row([]);
      csv += row(['LABOR','Hours','Rate','','Line Total']);
      (estimate.labor||[]).forEach(l => { csv += row([l.task, l.hours, '$'+l.rate+'/hr','', l.line_total]); });
      csv += row(['Labor Subtotal','','','', estimate.totals?.labor_subtotal||0]);
      csv += row([]);
    }
    csv += row(['GRAND TOTAL','','','', estimate.totals?.grand_total||0]);
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'estimate_' + Date.now() + '.csv'; a.click();
  URL.revokeObjectURL(url);
  showToast('CSV downloaded — open in Google Sheets', 'success');
}

function doCopyText() {
  const ctx = window._exportContext;
  if (!ctx) return;
  const paid = isPaid();
  const line = '─'.repeat(56);
  const pad = (s,n) => String(s).substring(0,n).padEnd(n);
  const rpad = (s,n) => String(s).padStart(n);
  let text = '';

  if (ctx.breakdown) {
    text = `CONSTRUCTION ESTIMATE — BY ROOM\nJob: ${ctx.project.name}\nDate: ${formatDate(new Date().toISOString())}\n\n`;
    ctx.project.rooms.forEach(room => {
      if (!room.photos.length) return;
      const agg = aggregateEstimates(room.photos);
      text += `${line}\nROOM: ${room.name}\n${line}\n`;
      text += 'SCOPE OF WORKS\n';
      agg.scope_of_works.forEach((s,i) => { text += `${i+1}. ${s}\n`; });
      text += `Room Total: ${formatMoney(agg.totals.grand_total)}\n\n`;
    });
    const t = projectTotals(ctx.project);
    text += `${line}\nGRAND TOTAL: ${formatMoney(t.grand_total)}\n`;
  } else {
    const { estimate, headline } = ctx;
    text = `CONSTRUCTION ESTIMATE\n${headline}\nDate: ${formatDate(new Date().toISOString())}\n\n`;
    text += `SCOPE OF WORKS\n${line}\n`;
    (estimate.scope_of_works||[]).forEach((s,i) => { text += `${i+1}. ${s}\n`; });
    if (paid) {
      text += `\nMATERIALS\n${line}\n`;
      text += pad('Item',32)+rpad('Qty',5)+rpad('Unit $',10)+rpad('Total',10)+'\n';
      (estimate.materials||[]).forEach(m => {
        text += pad(m.item,32)+rpad(m.quantity,5)+rpad(formatMoney(m.unit_cost),10)+rpad(formatMoney(m.line_total),10)+'\n';
      });
      text += pad('Subtotal',47)+rpad(formatMoney(estimate.totals?.materials_subtotal),10)+'\n\n';
      text += `LABOR\n${line}\n`;
      (estimate.labor||[]).forEach(l => {
        text += pad(l.task,32)+rpad(l.hours+'h',5)+rpad('$'+l.rate+'/hr',10)+rpad(formatMoney(l.line_total),10)+'\n';
      });
      text += pad('Subtotal',47)+rpad(formatMoney(estimate.totals?.labor_subtotal),10)+'\n\n';
    }
    text += `${line}\nGRAND TOTAL: ${formatMoney(estimate.totals?.grand_total)}\n`;
    if (estimate.estimate_notes) text += `\nNotes: ${estimate.estimate_notes}\n`;
  }

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied! Paste into Google Docs','success')).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); showToast('Copied! Paste into Google Docs','success'); }
  catch { showToast('Copy failed — please copy manually','error'); }
  document.body.removeChild(ta);
}

function notFound() {
  document.getElementById('estimateContent').innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Estimate not found.</p></div>';
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer;
function showToast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' '+type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
}
