const HISTORY_KEY = 'gc_estimates';
const MAX_HISTORY = 50;

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveEstimate(record) {
  try {
    const history = getHistory();
    history.unshift(record);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch (e) {
    // localStorage full — prune oldest 10 and retry
    try {
      const history = getHistory().slice(0, MAX_HISTORY - 10);
      history.unshift(record);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // silently fail if still full
    }
  }
}

function getEstimateById(id) {
  return getHistory().find(r => r.id === id) || null;
}

function deleteEstimate(id) {
  const updated = getHistory().filter(r => r.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatMoney(n) {
  return '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
