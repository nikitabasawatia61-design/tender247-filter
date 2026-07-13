let scanResult = null;
let activeTab = 'matched';

const CATEGORY_TABS = ['gem_msme', 'gem', 'psu', 'state_govt', 'private'];

const $ = (id) => document.getElementById(id);

function setDefaultDate() {
  $('closingDate').value = '2026-07-17';
}

function showProgress(show) {
  $('progress').classList.toggle('hidden', !show);
}

function setProgress(pct, text) {
  $('progressFill').style.width = `${Math.min(100, pct)}%`;
  $('progressText').textContent = text;
}

function countForCategory(category) {
  const s = scanResult?.summary;
  if (!s) return 0;
  const key = {
    gem_msme: 'matched_gem_msme',
    gem: 'matched_gem',
    psu: 'matched_psu',
    state_govt: 'matched_state_govt',
    private: 'matched_private',
  }[category];
  if (key && s[key] != null) return s[key];
  const bucket = scanResult?.matched_buckets?.[category];
  if (bucket) return bucket.length;
  return (scanResult?.matched || []).filter((r) => r.category === category).length;
}

function renderStats(summary) {
  $('statsPanel').classList.remove('hidden');
  const items = [
    ['Total fetched', summary.total_fetched, ''],
    ['Matched (all)', summary.matched, 'ok'],
    ['GeM + MSME', summary.matched_gem_msme ?? 0, 'ok'],
    ['GeM', summary.matched_gem ?? 0, ''],
    ['PSU', summary.matched_psu ?? 0, ''],
    ['State Govt', summary.matched_state_govt ?? 0, ''],
    ['Private', summary.matched_private ?? 0, ''],
    ['Supply', summary.supply_related ?? 0, 'warn'],
    ['Excluded', (summary.excluded_not_field || 0) + (summary.excluded_financial_api || 0), ''],
  ];
  $('stats').innerHTML = items
    .map(
      ([label, num, cls]) =>
        `<div class="stat"><div class="num ${cls}">${num}</div><div class="label">${label}</div></div>`
    )
    .join('');
}

function getMatchedRows(category) {
  const buckets = scanResult?.matched_buckets;
  if (buckets?.[category]?.length) return buckets[category];
  return (scanResult?.matched || []).filter((r) => r.category === category);
}

function getRowsForTab() {
  if (!scanResult) return [];
  const q = $('searchBox').value.toLowerCase().trim();

  let rows = [];
  if (activeTab === 'matched') {
    rows = scanResult.matched || [];
  } else if (CATEGORY_TABS.includes(activeTab)) {
    rows = getMatchedRows(activeTab);
  } else if (activeTab === 'supply') {
    rows = scanResult.supply || [];
  } else {
    const ex = scanResult.excluded || {};
    rows = [
      ...(ex.not_field || []).map((r) => ({ ...r, exclude_type: 'Not field' })),
      ...(ex.financial_api || []).map((r) => ({ ...r, exclude_type: 'Finance (API)' })),
    ];
  }

  if (!q) return rows;
  return rows.filter(
    (r) =>
      (r.organization || '').toLowerCase().includes(q) ||
      (r.brief || '').toLowerCase().includes(q) ||
      (r.portal || '').toLowerCase().includes(q) ||
      String(r.tender_id || '').includes(q)
  );
}

function msmeBadge(r) {
  const v = String(r.msme || '').toLowerCase();
  if (!v || v === 'no' || v === '0') return '—';
  return '<span class="badge">MSME</span>';
}

function renderMatchedTable(rows, showCategory = false) {
  const categoryCol = showCategory ? '<th>Category</th>' : '';
  return `
    <table>
      <thead><tr>
        <th>ID</th><th>Organization</th><th>Brief</th>${categoryCol}<th>Portal</th><th>Value</th><th>EMD</th><th>MSME</th><th></th>
      </tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
            <td>${r.tender_id}</td>
            <td>${esc(r.organization || '—')}${r.org_type ? `<div class="notes">${esc(r.org_type)}</div>` : ''}</td>
            <td class="brief">${esc((r.brief || '').slice(0, 140))}
              ${r.notes?.length ? `<div class="notes">${esc(r.notes.join(' · '))}</div>` : ''}
            </td>
            ${showCategory ? `<td>${esc(r.category_label || r.category || '—')}</td>` : ''}
            <td>${esc(r.portal || '—')}</td>
            <td>${esc(r.value_fmt || '—')}</td>
            <td>${esc(r.emd_fmt || '—')}</td>
            <td>${msmeBadge(r)}</td>
            <td>${r.url ? `<a class="link" href="${r.url}" target="_blank" rel="noopener">Open</a>` : ''}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

function renderSupplyTable(rows) {
  return `
    <table>
      <thead><tr>
        <th>ID</th><th>Organization</th><th>Brief</th><th>Value</th><th>EMD</th><th>Reason</th><th></th>
      </tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
            <td>${r.tender_id}</td>
            <td>${esc(r.organization || '—')}</td>
            <td class="brief">${esc((r.brief || '').slice(0, 140))}</td>
            <td>${esc(r.value_fmt || '—')}</td>
            <td>${esc(r.emd_fmt || '—')}</td>
            <td>${esc(r.reason || 'Supply related')}</td>
            <td>${r.url ? `<a class="link" href="${r.url}" target="_blank" rel="noopener">Open</a>` : ''}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

function updateTabCounts() {
  $('countMatched').textContent = scanResult?.summary?.matched ?? scanResult?.matched?.length ?? 0;
  $('countGemMsme').textContent = countForCategory('gem_msme');
  $('countGem').textContent = countForCategory('gem');
  $('countPsu').textContent = countForCategory('psu');
  $('countStateGovt').textContent = countForCategory('state_govt');
  $('countPrivate').textContent = countForCategory('private');
  $('countSupply').textContent = scanResult?.summary?.supply_related ?? scanResult?.supply?.length ?? 0;
  const ex = scanResult?.excluded || {};
  $('countExcluded').textContent = (ex.not_field?.length || 0) + (ex.financial_api?.length || 0);
}

function renderTable() {
  const rows = getRowsForTab();
  updateTabCounts();

  if (!scanResult) {
    $('tableWrap').innerHTML = '<p class="empty">Pick a closing date and click Scan tenders.</p>';
    return;
  }

  if (!rows.length) {
    const hint =
      activeTab === 'matched' || CATEGORY_TABS.includes(activeTab)
        ? ' Try another tab — category filters, <strong>Supply</strong>, or <strong>Excluded</strong>.'
        : '';
    $('tableWrap').innerHTML = `<p class="empty">No tenders in this tab${$('searchBox').value ? ' matching search' : ''}.${hint}</p>`;
    return;
  }

  if (activeTab === 'excluded') {
    $('tableWrap').innerHTML = `
      <table>
        <thead><tr>
          <th>ID</th><th>Organization</th><th>Brief</th><th>Type</th><th>Reason</th>
        </tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
              <td>${r.tender_id}</td>
              <td>${esc(r.organization || '—')}</td>
              <td class="brief">${esc((r.brief || '').slice(0, 120))}</td>
              <td>${esc(r.exclude_type || '—')}</td>
              <td>${esc(r.reason || '—')}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
    return;
  }

  if (activeTab === 'supply') {
    $('tableWrap').innerHTML = renderSupplyTable(rows);
    return;
  }

  $('tableWrap').innerHTML = renderMatchedTable(rows, activeTab === 'matched');
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyResult(result) {
  scanResult = result;
  renderStats(result.summary);
  $('exportBtn').disabled = false;
  renderTable();
}

async function runScan() {
  const closingDate = $('closingDate').value;
  if (!closingDate) return alert('Select a closing date');

  $('scanBtn').disabled = true;
  $('loadCacheBtn').disabled = true;
  showProgress(true);
  setProgress(0, 'Connecting…');

  const readDocuments = $('readDocuments').checked;

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closingDate, readDocuments }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        const data = JSON.parse(line.slice(5).trim());

        if (data.type === 'progress') {
          if (data.phase === 'documents' && data.total) {
            setProgress((data.current / data.total) * 100, data.message);
          } else if (data.phase === 'done') {
            setProgress(95, data.message);
          } else {
            setProgress(10, data.message);
          }
        } else if (data.type === 'complete') {
          setProgress(98, 'Loading results…');
          const cacheRes = await fetch(`/api/cache/${data.closingDate}`);
          if (!cacheRes.ok) throw new Error('Scan finished but results file missing — try Load cached scan');
          applyResult(await cacheRes.json());
          setProgress(100, 'Complete');
        } else if (data.type === 'error') {
          throw new Error(data.message);
        }
      }
    }
  } catch (err) {
    $('tableWrap').innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  } finally {
    $('scanBtn').disabled = false;
    $('loadCacheBtn').disabled = false;
    setTimeout(() => showProgress(false), 800);
  }
}

async function loadCache() {
  const closingDate = $('closingDate').value;
  if (!closingDate) return alert('Select a closing date');

  $('loadCacheBtn').disabled = true;
  try {
    const res = await fetch(`/api/cache/${closingDate}`);
    if (!res.ok) throw new Error('No cached scan for this date — run Scan first');
    applyResult(await res.json());
  } catch (err) {
    alert(err.message);
  } finally {
    $('loadCacheBtn').disabled = false;
  }
}

function exportJson() {
  if (!scanResult) return;
  const blob = new Blob([JSON.stringify(scanResult, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tenders_${scanResult.closing_date}.json`;
  a.click();
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    renderTable();
  });
});

$('scanBtn').addEventListener('click', runScan);
$('loadCacheBtn').addEventListener('click', loadCache);
$('exportBtn').addEventListener('click', exportJson);
$('searchBox').addEventListener('input', renderTable);

setDefaultDate();
