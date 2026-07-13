let scanResult = null;
let activeTab = 'matched';

const $ = (id) => document.getElementById(id);

function setDefaultDate() {
  // Known active date in profile; change as needed
  $('closingDate').value = '2026-07-17';
}

function showProgress(show) {
  $('progress').classList.toggle('hidden', !show);
}

function setProgress(pct, text) {
  $('progressFill').style.width = `${Math.min(100, pct)}%`;
  $('progressText').textContent = text;
}

function renderStats(summary) {
  $('statsPanel').classList.remove('hidden');
  const items = [
    ['Total fetched', summary.total_fetched, ''],
    ['Matched', summary.matched, 'ok'],
    ['Not your field', summary.excluded_not_field, ''],
    ['Excluded (API finance)', summary.excluded_financial_api, ''],
  ];
  $('stats').innerHTML = items
    .map(
      ([label, num, cls]) =>
        `<div class="stat"><div class="num ${cls}">${num}</div><div class="label">${label}</div></div>`
    )
    .join('');
}

function getRowsForTab() {
  if (!scanResult) return [];
  const q = $('searchBox').value.toLowerCase().trim();

  let rows = [];
  if (activeTab === 'matched') rows = scanResult.matched || [];
  else {
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
      String(r.tender_id || '').includes(q)
  );
}

function renderTable() {
  const rows = getRowsForTab();
  $('countMatched').textContent = scanResult?.summary?.matched ?? 0;
  const ex = scanResult?.excluded || {};
  $('countExcluded').textContent =
    (ex.not_field?.length || 0) + (ex.financial_api?.length || 0);

  if (!scanResult) {
    $('tableWrap').innerHTML = '<p class="empty">Pick a closing date and click Scan tenders.</p>';
    return;
  }

  if (!rows.length) {
    const hint =
      activeTab === 'matched' && scanResult.summary?.matched === 0
        ? ' Check the <strong>Excluded</strong> tab.'
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

  $('tableWrap').innerHTML = `
    <table>
      <thead><tr>
        <th>ID</th><th>Organization</th><th>Brief</th><th>Value</th><th>EMD</th><th>MSME</th><th></th>
      </tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
            <td>${r.tender_id}</td>
            <td>${esc(r.organization || '—')}</td>
            <td class="brief">${esc((r.brief || '').slice(0, 140))}
              ${r.notes?.length ? `<div class="notes">${esc(r.notes.join(' · '))}</div>` : ''}
            </td>
            <td>${esc(r.value_fmt || '—')}</td>
            <td>${esc(r.emd_fmt || '—')}</td>
            <td>${r.msme ? '<span class="badge">MSME</span>' : '—'}</td>
            <td>${r.url ? `<a class="link" href="${r.url}" target="_blank" rel="noopener">Open</a>` : ''}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
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
