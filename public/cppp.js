let cpppResult = null;
let activeTab = 'matched';
let shortlist = {};
let eprocSessionId = null;

const SHORTLIST_KEY = 't247_cppp_shortlist_v1';
const $ = (id) => document.getElementById(id);

function loadShortlist() {
  try {
    shortlist = JSON.parse(localStorage.getItem(SHORTLIST_KEY) || '{}');
  } catch {
    shortlist = {};
  }
}

function saveShortlist() {
  localStorage.setItem(SHORTLIST_KEY, JSON.stringify(shortlist));
}

function isShortlisted(id) {
  return Boolean(shortlist[String(id)]);
}

function toggleShortlist(row, checked) {
  const id = String(row.tender_id);
  if (checked) shortlist[id] = { ...row, shortlisted_at: new Date().toISOString() };
  else delete shortlist[id];
  saveShortlist();
  updateCounts();
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
    ['Organisations', summary.organisations, ''],
    ['All tenders', summary.total_tenders, ''],
    ['Matched to bid', summary.matched, 'ok'],
    ['Supply', summary.supply, ''],
    ['Excluded', summary.excluded, ''],
    ['Other', summary.other, ''],
    ['Shortlisted', Object.keys(shortlist).length, 'shortlist'],
  ];
  $('stats').innerHTML = items
    .map(([label, num, cls]) => `<div class="stat"><div class="num ${cls}">${num}</div><div class="label">${label}</div></div>`)
    .join('');
}

function filterRows(rows) {
  const q = $('searchBox').value.toLowerCase().trim();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      (r.title || r.brief || '').toLowerCase().includes(q) ||
      (r.organisation || r.name || '').toLowerCase().includes(q) ||
      (r.reference_no || '').toLowerCase().includes(q) ||
      String(r.tender_id || '').includes(q)
  );
}

function getExcludedRows() {
  if (!cpppResult?.excluded) return [];
  return [...(cpppResult.excluded.not_field || []), ...(cpppResult.excluded.financial_api || [])];
}

function getRowsForTab() {
  if (activeTab === 'shortlisted') {
    return filterRows(Object.values(shortlist));
  }
  if (!cpppResult) return [];
  if (activeTab === 'matched') return filterRows(cpppResult.matched || cpppResult.it_matched || []);
  if (activeTab === 'supply_hardware') return filterRows(cpppResult.supply_hardware || []);
  if (activeTab === 'supply_software') return filterRows(cpppResult.supply_software || []);
  if (activeTab === 'excluded') return filterRows(getExcludedRows());
  if (activeTab === 'other') return filterRows(cpppResult.other || []);
  if (activeTab === 'organisations') return filterRows(cpppResult.organisations || []);
  if (activeTab === 'all_tenders') return filterRows(cpppResult.tenders || []);
  return [];
}

function pickCell(r) {
  const id = esc(String(r.tender_id));
  const checked = isShortlisted(r.tender_id) ? 'checked' : '';
  return `<td class="col-shortlist"><input type="checkbox" class="shortlist-cb" data-tender-id="${id}" ${checked} /></td>`;
}

function renderTenderTable(rows, opts = {}) {
  const { showReason = false, showValue = false, showMatch = false } = opts;
  return `
    <table>
      <thead><tr>
        <th class="col-shortlist">Pick</th>
        <th>Ref / ID</th><th>Organisation</th><th>Title</th>
        ${showMatch ? '<th>Match</th>' : ''}
        ${showReason ? '<th>Reason</th>' : ''}
        ${showValue ? '<th>Value</th><th>EMD</th>' : ''}
        <th>Closing</th><th>Published</th><th></th>
      </tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr class="${isShortlisted(r.tender_id) ? 'row-shortlisted' : ''}">
          ${pickCell(r)}
          <td>${esc(r.reference_no || r.tender_id || '—')}</td>
          <td>${esc(r.organisation || '—')}</td>
          <td class="brief">${esc((r.title || r.brief || '').slice(0, 160))}</td>
          ${showMatch ? `<td>${esc(r.match_reason || '—')}</td>` : ''}
          ${showReason ? `<td>${esc(r.reason || '—')}</td>` : ''}
          ${showValue ? `<td>${esc(r.value_fmt || 'Refer Document')}</td><td>${esc(r.emd_fmt || 'Refer Document')}</td>` : ''}
          <td>${esc(r.closing_date || '—')}</td>
          <td>${esc(r.published_date || '—')}</td>
          <td>${r.detail_url ? `<a class="link" href="${r.detail_url}" target="_blank" rel="noopener">Open CPPP</a>` : ''}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

function renderOrgTable(rows) {
  return `
    <table>
      <thead><tr><th>#</th><th>Organisation Name</th><th>Tender Count</th><th>Actions</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (r, i) => `<tr>
          <td>${i + 1}</td>
          <td>${esc(r.name || '—')}</td>
          <td>${r.tender_count ?? '—'}</td>
          <td class="org-actions">
            ${r.org_link && eprocSessionId ? `<button type="button" class="secondary fetch-org-btn" data-org-link="${esc(r.org_link)}" data-org-name="${esc(r.name || '')}">Fetch tenders</button>` : ''}
            ${r.org_link ? `<a class="link" href="${r.org_link}" target="_blank" rel="noopener">Portal</a>` : ''}
          </td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

function updateCounts() {
  const s = cpppResult?.summary;
  $('countMatched').textContent = s?.matched ?? s?.it_matched ?? 0;
  $('countSupplyHw').textContent = s?.supply_hardware ?? 0;
  $('countSupplySw').textContent = s?.supply_software ?? 0;
  $('countExcluded').textContent = s?.excluded ?? 0;
  $('countOther').textContent = s?.other ?? 0;
  $('countAll').textContent = s?.total_tenders ?? 0;
  $('countOrgs').textContent = s?.organisations ?? 0;
  $('countShortlisted').textContent = Object.keys(shortlist).length;

  const hasOrgs = (s?.organisations ?? 0) > 0;
  $('fetchAllBtn').disabled = !eprocSessionId || !hasOrgs;
}

function renderTable() {
  updateCounts();
  const rows = getRowsForTab();

  if (!cpppResult && activeTab !== 'shortlisted') {
    $('tableWrap').innerHTML = '<p class="empty">Refresh captcha, enter the code, then Search organisations.</p>';
    return;
  }

  if (!rows.length) {
    $('tableWrap').innerHTML = `<p class="empty">No rows in this tab${$('searchBox').value ? ' matching search' : ''}.</p>`;
    return;
  }

  if (activeTab === 'organisations') {
    $('tableWrap').innerHTML = renderOrgTable(rows);
    return;
  }

  const showReason = activeTab === 'excluded' || activeTab === 'supply_hardware' || activeTab === 'supply_software' || activeTab === 'other';
  const showValue = activeTab === 'matched' || activeTab === 'excluded';
  const showMatch = activeTab === 'matched';
  $('tableWrap').innerHTML = renderTenderTable(rows, { showReason, showValue, showMatch });
}

function applyResult(result) {
  cpppResult = result;
  renderStats(result.summary);
  $('exportBtn').disabled = false;
  updateCounts();
  renderTable();
}

async function refreshCaptcha() {
  $('refreshCaptchaBtn').disabled = true;
  $('searchOrgsBtn').disabled = true;
  showProgress(true);
  setProgress(20, 'Loading captcha from eprocure.gov.in…');
  try {
    const res = await fetch('/api/cppp/session');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load captcha');
    eprocSessionId = data.sessionId;
    $('captchaImg').src = data.captchaImage;
    $('captchaImg').classList.remove('hidden');
    $('captchaText').value = '';
    $('captchaText').focus();
    setProgress(100, 'Captcha ready — enter 6 characters, then Search');
  } catch (err) {
    $('tableWrap').innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  } finally {
    $('refreshCaptchaBtn').disabled = false;
    $('searchOrgsBtn').disabled = false;
    updateCounts();
    setTimeout(() => showProgress(false), 600);
  }
}

async function fetchOrgTenders(orgLink, orgName) {
  if (!eprocSessionId) {
    alert('Refresh captcha and search organisations first');
    return;
  }
  showProgress(true);
  setProgress(40, `Fetching tenders for ${orgName || 'organisation'}…`);
  try {
    const res = await fetch('/api/cppp/fetch-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: eprocSessionId, org_link: orgLink, org_name: orgName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Fetch failed');
    applyResult(data);
    setProgress(100, `Added ${data.fetched_count} tenders — ${data.summary.matched} matched to bid`);
  } catch (err) {
    alert(err.message);
  } finally {
    setTimeout(() => showProgress(false), 600);
  }
}

async function fetchAllTenders() {
  if (!eprocSessionId) {
    alert('Refresh captcha and search organisations first');
    return;
  }
  if (!cpppResult?.organisations?.length) {
    alert('Search organisations first');
    return;
  }

  const orgCount = cpppResult.organisations.length;
  if (!confirm(`Fetch tenders from all ${orgCount} organisations? This may take several minutes.`)) {
    return;
  }

  $('fetchAllBtn').disabled = true;
  showProgress(true);
  setProgress(5, `Starting fetch for ${orgCount} organisations…`);

  try {
    const res = await fetch('/api/cppp/fetch-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: eprocSessionId,
        organisations: cpppResult.organisations,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

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
        const line = part.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        let evt;
        try {
          evt = JSON.parse(line.slice(6));
        } catch {
          continue;
        }

        if (evt.type === 'progress') {
          const pct =
            evt.total && evt.current
              ? Math.min(95, Math.round((evt.current / evt.total) * 90) + 5)
              : 30;
          setProgress(pct, evt.message || 'Fetching…');
        } else if (evt.type === 'error') {
          throw new Error(evt.message || 'Fetch failed');
        } else if (evt.type === 'complete') {
          applyResult(evt);
          activeTab = 'matched';
          document.querySelectorAll('.tab').forEach((b) => {
            b.classList.toggle('active', b.dataset.tab === activeTab);
          });
          const errNote =
            evt.fetch_errors?.length ? ` (${evt.fetch_errors.length} orgs skipped)` : '';
          setProgress(
            100,
            `Done — ${evt.summary.total_tenders} tenders, ${evt.summary.matched} matched to bid${errNote}`
          );
        }
      }
    }
  } catch (err) {
    $('tableWrap').innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  } finally {
    $('fetchAllBtn').disabled = false;
    setTimeout(() => showProgress(false), 1200);
  }
}

async function searchOrganisations() {
  if (!eprocSessionId) {
    await refreshCaptcha();
    if (!eprocSessionId) return;
  }
  const captchaText = $('captchaText').value.replace(/\s+/g, '');
  $('captchaText').value = captchaText;
  if (captchaText.length !== 6) {
    alert('Enter the 6-character captcha from the image (no spaces)');
    return;
  }

  $('searchOrgsBtn').disabled = true;
  showProgress(true);
  setProgress(30, 'Searching organisations on CPPP…');

  try {
    const res = await fetch('/api/cppp/search-orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: eprocSessionId,
        captchaText,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed');
    applyResult(data);
    setProgress(100, `Loaded ${data.summary.organisations} organisations — click Fetch all tenders`);
    activeTab = 'organisations';
    document.querySelectorAll('.tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === activeTab);
    });
    $('captchaText').value = '';
  } catch (err) {
    $('tableWrap').innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
    if (/Wrong captcha|Session expired|Search failed/i.test(err.message)) {
      await refreshCaptcha();
    }
  } finally {
    $('searchOrgsBtn').disabled = false;
    setTimeout(() => showProgress(false), 800);
  }
}

async function loadCache() {
  try {
    const res = await fetch('/api/cppp/cache');
    if (!res.ok) throw new Error('No cached CPPP data — search or import first');
    applyResult(await res.json());
  } catch (err) {
    alert(err.message);
  }
}

async function submitIngest() {
  const raw = $('ingestJson').value.trim();
  if (!raw) return alert('Paste JSON first');
  try {
    const payload = JSON.parse(raw);
    const res = await fetch('/api/cppp/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Import failed');
    applyResult(data);
    $('ingestPanel').open = false;
  } catch (err) {
    alert(err.message);
  }
}

function exportJson() {
  if (!cpppResult) return;
  const blob = new Blob([JSON.stringify({ ...cpppResult, shortlisted: Object.values(shortlist) }, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cppp_it_tenders_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

function findTenderById(id) {
  const pools = [
    ...(cpppResult?.tenders || []),
    ...(cpppResult?.matched || []),
    ...(cpppResult?.supply || []),
    ...getExcludedRows(),
  ];
  return pools.find((r) => String(r.tender_id) === String(id));
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    renderTable();
  });
});

$('tableWrap').addEventListener('click', (e) => {
  const btn = e.target.closest('.fetch-org-btn');
  if (!btn) return;
  fetchOrgTenders(btn.dataset.orgLink, btn.dataset.orgName);
});

$('tableWrap').addEventListener('change', (e) => {
  if (!e.target.classList.contains('shortlist-cb')) return;
  const id = e.target.dataset.tenderId;
  const row = findTenderById(id) || shortlist[id];
  if (!row) return;
  toggleShortlist(row, e.target.checked);
  if (activeTab === 'shortlisted' && !e.target.checked) renderTable();
  else e.target.closest('tr')?.classList.toggle('row-shortlisted', e.target.checked);
});

$('refreshCaptchaBtn').addEventListener('click', refreshCaptcha);
$('searchOrgsBtn').addEventListener('click', searchOrganisations);
$('fetchAllBtn').addEventListener('click', fetchAllTenders);
$('loadCacheBtn').addEventListener('click', loadCache);
$('ingestBtn').addEventListener('click', () => {
  $('ingestPanel').open = true;
});
$('ingestSubmitBtn').addEventListener('click', submitIngest);
$('exportBtn').addEventListener('click', exportJson);
$('searchBox').addEventListener('input', renderTable);

loadShortlist();
refreshCaptcha().catch(() => {});
loadCache().catch(() => {});
updateCounts();
