// ─── Storage Keys ─────────────────────────────────────────
const PROJECTS_KEY      = 'gc_projects';
const MATERIALS_DB_KEY  = 'gc_materials_db';
const TIER_KEY          = 'gc_tier';
const LICENSE_EMAIL_KEY = 'gc_license_email';
const LICENSE_CODE_KEY  = 'gc_license_code';

// ─── Tier ─────────────────────────────────────────────────

function getTier() { return localStorage.getItem(TIER_KEY) || 'free'; }
function setTier(tier) { localStorage.setItem(TIER_KEY, tier); }
function isPaid() { return getTier() === 'paid' && !!localStorage.getItem(LICENSE_CODE_KEY); }
function getLicenseEmail() { return localStorage.getItem(LICENSE_EMAIL_KEY) || ''; }
function activateLicense(email, code) {
  localStorage.setItem(TIER_KEY, 'paid');
  localStorage.setItem(LICENSE_EMAIL_KEY, email);
  localStorage.setItem(LICENSE_CODE_KEY, code);
}
function revokeLicense() {
  localStorage.removeItem(TIER_KEY);
  localStorage.removeItem(LICENSE_EMAIL_KEY);
  localStorage.removeItem(LICENSE_CODE_KEY);
}

// ─── Projects ─────────────────────────────────────────────

function getProjects() {
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]'); }
  catch { return []; }
}

function saveProjects(projects) {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) return false;
    throw e;
  }
}

function createProject(name) {
  const project = {
    id: 'proj_' + Date.now(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
    gallery: [],   // unassigned photos captured on site
    rooms: []
  };
  const projects = getProjects();
  projects.unshift(project);
  saveProjects(projects);
  return project;
}

function getProjectById(id) {
  return getProjects().find(p => p.id === id) || null;
}

function updateProject(id, changes) {
  const projects = getProjects();
  const idx = projects.findIndex(p => p.id === id);
  if (idx === -1) return null;
  projects[idx] = { ...projects[idx], ...changes };
  saveProjects(projects);
  return projects[idx];
}

function deleteProject(id) {
  saveProjects(getProjects().filter(p => p.id !== id));
}

// ─── Gallery (unassigned job photos) ──────────────────────

function addGalleryPhotos(projectId, photoArray) {
  photoArray.forEach(photo => addGalleryPhoto(projectId, photo));
}

// Saves one photo at a time — returns true on success, false if storage is full
function addGalleryPhoto(projectId, photo) {
  const projects = getProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return false;
  if (!project.gallery) project.gallery = [];
  project.gallery.push(photo);
  return saveProjects(projects);
}

function removeGalleryPhoto(projectId, photoId) {
  const projects = getProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project || !project.gallery) return;
  project.gallery = project.gallery.filter(p => p.id !== photoId);
  saveProjects(projects);
}

function assignPhotosToRoom(projectId, photoIds, roomId) {
  const projects = getProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  const room = project.rooms.find(r => r.id === roomId);
  if (!room) return;

  const toAssign = (project.gallery || []).filter(p => photoIds.includes(p.id));

  toAssign.forEach(gPhoto => {
    room.photos.push({
      id: gPhoto.id,
      thumbnailDataUrl: gPhoto.thumbnailDataUrl,
      fullBase64: gPhoto.fullBase64,
      mimeType: gPhoto.mimeType || 'image/jpeg',
      capturedAt: gPhoto.capturedAt,
      label: '',
      notes: '',
      analyzed: false,
      estimate: null
    });
  });

  // Remove from gallery
  project.gallery = (project.gallery || []).filter(p => !photoIds.includes(p.id));
  saveProjects(projects);
}

// ─── Rooms ────────────────────────────────────────────────

function addRoom(projectId, name) {
  const projects = getProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return null;
  const room = {
    id: 'room_' + Date.now(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
    photos: []
  };
  project.rooms.push(room);
  saveProjects(projects);
  return room;
}

function getRoomById(projectId, roomId) {
  const project = getProjectById(projectId);
  if (!project) return null;
  return project.rooms.find(r => r.id === roomId) || null;
}

function updateRoom(projectId, roomId, changes) {
  const projects = getProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return null;
  const idx = project.rooms.findIndex(r => r.id === roomId);
  if (idx === -1) return null;
  project.rooms[idx] = { ...project.rooms[idx], ...changes };
  saveProjects(projects);
  return project.rooms[idx];
}

function deleteRoom(projectId, roomId) {
  // Return room photos to gallery
  const projects = getProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  const room = project.rooms.find(r => r.id === roomId);
  if (room && room.photos.length) {
    if (!project.gallery) project.gallery = [];
    room.photos.forEach(p => {
      project.gallery.push({
        id: p.id,
        thumbnailDataUrl: p.thumbnailDataUrl,
        fullBase64: p.fullBase64,
        mimeType: p.mimeType,
        capturedAt: p.capturedAt
      });
    });
  }
  project.rooms = project.rooms.filter(r => r.id !== roomId);
  saveProjects(projects);
}

// ─── Room Photos ──────────────────────────────────────────

function updateRoomPhoto(projectId, roomId, photoId, changes) {
  const projects = getProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  const room = project.rooms.find(r => r.id === roomId);
  if (!room) return;
  const idx = room.photos.findIndex(p => p.id === photoId);
  if (idx === -1) return;
  room.photos[idx] = { ...room.photos[idx], ...changes };
  saveProjects(projects);
}

function deleteRoomPhoto(projectId, roomId, photoId) {
  const projects = getProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return;
  const room = project.rooms.find(r => r.id === roomId);
  if (!room) return;
  // Return to gallery
  const photo = room.photos.find(p => p.id === photoId);
  if (photo) {
    if (!project.gallery) project.gallery = [];
    project.gallery.push({
      id: photo.id,
      thumbnailDataUrl: photo.thumbnailDataUrl,
      fullBase64: photo.fullBase64,
      mimeType: photo.mimeType,
      capturedAt: photo.capturedAt
    });
  }
  room.photos = room.photos.filter(p => p.id !== photoId);
  saveProjects(projects);
}

// ─── Custom Materials DB (paid) ───────────────────────────

function getMaterialsDb() {
  try { return JSON.parse(localStorage.getItem(MATERIALS_DB_KEY) || '[]'); }
  catch { return []; }
}

function saveMaterialsDb(list) {
  localStorage.setItem(MATERIALS_DB_KEY, JSON.stringify(list));
}

function upsertMaterial(item) {
  const list = getMaterialsDb();
  const idx = list.findIndex(m => m.id === item.id);
  if (idx === -1) list.push({ ...item, id: 'mat_' + Date.now() });
  else list[idx] = item;
  saveMaterialsDb(list);
}

function deleteMaterial(id) {
  saveMaterialsDb(getMaterialsDb().filter(m => m.id !== id));
}

// ─── Aggregation ──────────────────────────────────────────

function aggregateEstimates(photos) {
  const analyzed = photos.filter(p => p.analyzed && p.estimate);
  const scope = [], materials = [], labor = [];
  let matTotal = 0, labTotal = 0;

  analyzed.forEach(photo => {
    const e = photo.estimate;
    (e.scope_of_works || []).forEach(s => { if (!scope.includes(s)) scope.push(s); });
    (e.materials || []).forEach(m => materials.push({ ...m, _source: photo.label || 'Photo' }));
    (e.labor || []).forEach(l => labor.push({ ...l, _source: photo.label || 'Photo' }));
    matTotal += parseFloat(e.totals?.materials_subtotal) || 0;
    labTotal += parseFloat(e.totals?.labor_subtotal) || 0;
  });

  return {
    scope_of_works: scope,
    materials,
    labor,
    totals: { materials_subtotal: matTotal, labor_subtotal: labTotal, grand_total: matTotal + labTotal },
    photoCount: analyzed.length
  };
}

function projectTotals(project) {
  let mat = 0, lab = 0;
  (project.rooms || []).forEach(room => {
    const agg = aggregateEstimates(room.photos);
    mat += agg.totals.materials_subtotal;
    lab += agg.totals.labor_subtotal;
  });
  return { materials_subtotal: mat, labor_subtotal: lab, grand_total: mat + lab };
}

// ─── Shared Helpers ───────────────────────────────────────

function formatMoney(n) {
  return '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function compressImage(dataUrl, maxWidth, quality) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const out = canvas.toDataURL('image/jpeg', quality);
      resolve({ dataUrl: out, base64: out.split(',')[1], mimeType: 'image/jpeg' });
    };
    img.src = dataUrl;
  });
}
