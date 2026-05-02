function getSettings() {
  return {
    laborRate: parseFloat(localStorage.getItem('gc_labor_rate') || '75'),
    markupPct: parseFloat(localStorage.getItem('gc_markup_pct') || '15'),
    contractorName: localStorage.getItem('gc_contractor_name') || ''
  };
}

function saveSettings({ laborRate, markupPct, contractorName }) {
  localStorage.setItem('gc_labor_rate', laborRate);
  localStorage.setItem('gc_markup_pct', markupPct);
  localStorage.setItem('gc_contractor_name', contractorName || '');
}
