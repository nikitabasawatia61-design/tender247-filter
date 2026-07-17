const { fmtMoney, getApiValue, getApiEmd } = require('./filters');
const { classifyCpppTender } = require('./cppp_filters');
const {
  mapCpppTender,
  mapCpppOrganisation,
  fetchFromConfiguredApi,
  loadLocalDataFile,
  loadCache,
  saveCache,
  extractArray,
} = require('./cppp');

function dedupeTenders(rows) {
  const seen = new Map();
  for (const row of rows) {
    const key = `${row.tender_id}|${row.title}|${row.organisation}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  return [...seen.values()];
}

function dedupeOrgs(rows) {
  const seen = new Map();
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, row);
    else {
      const prev = seen.get(key);
      prev.tender_count = Math.max(prev.tender_count, row.tender_count);
      if (!prev.org_link && row.org_link) prev.org_link = row.org_link;
    }
  }
  return [...seen.values()];
}

function enrichRow(t) {
  const item = { brief: t.title || t.brief || '', value: t.value ?? 0, emd: t.emd ?? 0 };
  return {
    ...t,
    brief: t.title,
    value: getApiValue(item),
    emd: getApiEmd(item),
    value_fmt: fmtMoney(getApiValue(item)),
    emd_fmt: fmtMoney(getApiEmd(item)),
  };
}

function classifyTenders(tenders) {
  const matched = [];
  const supply_hardware = [];
  const supply_software = [];
  const excluded_not_field = [];
  const excluded_financial_api = [];
  const other = [];

  for (const t of tenders) {
    const { bucket, row } = classifyCpppTender(enrichRow(t));
    const enriched = {
      ...row,
      value_fmt: row.value_fmt || fmtMoney(row.value ?? 0),
      emd_fmt: row.emd_fmt || fmtMoney(row.emd ?? 0),
    };

    switch (bucket) {
      case 'matched':
        matched.push(enriched);
        break;
      case 'supply_hardware':
        supply_hardware.push(enriched);
        break;
      case 'supply_software':
        supply_software.push(enriched);
        break;
      case 'excluded_not_field':
        excluded_not_field.push(enriched);
        break;
      case 'excluded_financial_api':
        excluded_financial_api.push(enriched);
        break;
      default:
        other.push(enriched);
    }
  }

  const sortByClosing = (a, b) => String(a.closing_date).localeCompare(String(b.closing_date));
  matched.sort(sortByClosing);
  supply_hardware.sort(sortByClosing);
  supply_software.sort(sortByClosing);
  other.sort(sortByClosing);

  const excluded = {
    not_field: excluded_not_field,
    financial_api: excluded_financial_api,
  };
  const supply = [...supply_hardware, ...supply_software];

  return {
    matched,
    supply,
    supply_hardware,
    supply_software,
    excluded,
    it_matched: matched,
    other,
  };
}

function normaliseIngestPayload(payload) {
  const orgRaw = payload.organisations || payload.organizations || [];
  const tenderRaw = payload.tenders || extractArray(payload) || [];

  const organisations = dedupeOrgs(
    orgRaw.map((o, i) => mapCpppOrganisation(o, i)).filter((o) => o.name)
  );

  const tenders = dedupeTenders(
    tenderRaw
      .map((t) => {
        const org = t.organisation || t.organization || t.organisation_name || '';
        return mapCpppTender(t, org);
      })
      .filter((t) => t.title)
  );

  return { organisations, tenders };
}

async function fetchRawCpppData() {
  const local = loadLocalDataFile();
  if (local) return normaliseIngestPayload(local);
  return fetchFromConfiguredApi();
}

function buildResult(raw, meta = {}) {
  const { organisations, tenders } = raw;
  const classified = classifyTenders(tenders);

  organisations.sort((a, b) => b.tender_count - a.tender_count);

  return {
    source: 'cppp',
    portal: 'https://eprocure.gov.in',
    scanned_at: new Date().toISOString(),
    note: 'Data from eprocure.gov.in (CPPP). Portal search requires CAPTCHA.',
    rules: {
      exclude: 'Civil, roads, HVAC, medical equipment, SCADA/CCMS, corrigendum, etc.',
      supply: 'Hardware vs software supply (not matched)',
      financial: 'List/API value only — remove if value > ₹1 Cr or EMD > ₹2 L when known',
      matched: 'Must match IT/software keywords (website, app dev, ERP, chatbot, etc.)',
    },
    ...meta,
    summary: {
      organisations: organisations.length,
      total_tenders: tenders.length,
      matched: classified.matched.length,
      it_matched: classified.matched.length,
      supply: classified.supply.length,
      supply_hardware: classified.supply_hardware.length,
      supply_software: classified.supply_software.length,
      excluded: classified.excluded.not_field.length + classified.excluded.financial_api.length,
      excluded_not_field: classified.excluded.not_field.length,
      excluded_financial_api: classified.excluded.financial_api.length,
      other: classified.other.length,
    },
    organisations,
    tenders,
    ...classified,
  };
}

async function scanCppp(opts = {}) {
  const { onProgress = () => {} } = opts;
  onProgress({ phase: 'fetch', message: 'Fetching CPPP tender data…' });
  const raw = await fetchRawCpppData();
  onProgress({
    phase: 'filter',
    message: `Filtering ${raw.tenders.length} tenders for IT/software…`,
  });
  const result = buildResult(raw, { fetch_mode: process.env.CPPP_DATA_FILE ? 'file' : 'api' });
  saveCache(result);
  onProgress({
    phase: 'done',
    message: `Done — ${result.summary.matched} IT tenders to bid`,
    ...result.summary,
  });
  return result;
}

function ingestCpppData(payload, meta = {}) {
  const raw = normaliseIngestPayload(payload);
  const result = buildResult(raw, { fetch_mode: meta.fetch_mode || 'ingest', ...meta });
  saveCache(result);
  return result;
}

module.exports = {
  scanCppp,
  ingestCpppData,
  loadCache,
  buildResult,
  normaliseIngestPayload,
  classifyTenders,
};
