const fs = require('fs');
const path = require('path');
const { readTenderDocuments } = require('../read_documents');
const { login, fetchTendersByClosing, getTenderDetail, mapSearchItem } = require('./api');
const {
  isFieldRelated,
  getExcludeReason,
  apiFinancialExclude,
  enrichFromDocuments,
  fmtMoney,
  toApiClosingDate,
  getApiValue,
  getApiEmd,
} = require('./filters');

async function mapPool(items, fn, limit = 3) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function baseRow(item) {
  return {
    tender_id: item.id,
    tender_number: item.num,
    organization: item.org,
    brief: item.brief.replace(/\s+/g, ' ').trim(),
    msme: item.msme || '',
    value: getApiValue(item),
    emd: getApiEmd(item),
    value_fmt: fmtMoney(getApiValue(item)),
    emd_fmt: fmtMoney(getApiEmd(item)),
    notes: [],
    url: `https://www.tender247.com/auth/tender/${item.id}/${item.security}`,
  };
}

function cachePath(isoDate) {
  const slug = toApiClosingDate(isoDate).replace(/-/g, '');
  return path.join(__dirname, '..', `closing_${slug}_filtered.json`);
}

function loadCache(isoDate) {
  const p = cachePath(isoDate);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveCache(isoDate, data) {
  fs.writeFileSync(cachePath(isoDate), JSON.stringify(data, null, 2));
}

/**
 * Remove tenders only when:
 * 1) Not in field (toners, laptops, solar, SCADA, civil, etc.)
 * 2) API shows value > ₹1 Cr or EMD > ₹2 Lakh
 *
 * Document reading is optional — enriches notes only, never excludes.
 */
async function scanClosingDate(isoDate, opts) {
  const {
    email,
    password,
    readDocuments = false,
    concurrency = 3,
    onProgress = () => {},
  } = opts;

  const apiDate = toApiClosingDate(isoDate);
  onProgress({ phase: 'login', message: 'Logging in…' });
  const { token, userId } = await login(email, password);

  onProgress({ phase: 'fetch', message: `Fetching tenders closing ${apiDate}…` });
  const raw = await fetchTendersByClosing(token, userId, apiDate);
  const all = raw.map(mapSearchItem);

  onProgress({ phase: 'filter', message: `Filtering ${all.length} tenders…`, total: all.length });

  const excludedNotField = [];
  const excludedFinancialApi = [];
  const candidates = [];

  for (const item of all) {
    if (!isFieldRelated(item)) {
      excludedNotField.push({
        tender_id: item.id,
        organization: item.org,
        brief: item.brief,
        reason: getExcludeReason(item),
      });
      continue;
    }
    const fin = apiFinancialExclude(item);
    if (fin) {
      excludedFinancialApi.push({
        tender_id: item.id,
        organization: item.org,
        brief: item.brief,
        reason: fin.reason,
        value_fmt: fmtMoney(fin.value),
        emd_fmt: fmtMoney(fin.emd),
      });
      continue;
    }
    candidates.push(item);
  }

  onProgress({
    phase: 'candidates',
    message: `${candidates.length} matched after field + API rules`,
    candidates: candidates.length,
  });

  let matched = candidates.map(baseRow);

  if (readDocuments && candidates.length) {
    onProgress({ phase: 'documents', message: 'Reading documents for notes…', total: candidates.length });

    matched = await mapPool(
      candidates,
      async (item, idx) => {
        onProgress({
          phase: 'documents',
          current: idx + 1,
          total: candidates.length,
          tender_id: item.id,
          message: `Reading docs ${idx + 1}/${candidates.length} — ${item.id}`,
        });

        const row = baseRow(item);
        const detail = await getTenderDetail(item.id, item.security, token);
        row.tender_number = detail?.tender_number || row.tender_number;
        row.organization = detail?.organization_name || row.organization;

        const cacheDir = path.join(__dirname, '..', 'docs', String(item.id));
        const doc = await readTenderDocuments(item.id, token, { cacheDir, maxDocs: 4 });
        const enriched = enrichFromDocuments(doc.fields, detail, item);

        row.value = enriched.value;
        row.emd = enriched.emd;
        row.value_fmt = fmtMoney(enriched.value);
        row.emd_fmt = fmtMoney(enriched.emd);
        row.documents_read = (doc.documentsRead || []).map((d) => d.type);
        row.notes = enriched.notes;
        if (enriched.warnings.length) row.notes.push(...enriched.warnings);
        if (doc.textLength < 50) {
          row.notes.push('Documents not readable — value/EMD may show as Refer Document');
        }
        return row;
      },
      concurrency
    );
  }

  matched.sort((a, b) => (a.emd || 999999) - (b.emd || 999999));

  const result = {
    closing_date: isoDate,
    closing_date_api: apiDate,
    scanned_at: new Date().toISOString(),
    rules: {
      exclude: 'Corrigendum, installation, toners, laptops, solar, SCADA, civil, etc.',
      financial: 'API only — remove if value > ₹1 Cr or EMD > ₹2 Lakh when known in API',
      documents: 'Optional notes only — never removes tenders',
    },
    summary: {
      total_fetched: all.length,
      excluded_not_field: excludedNotField.length,
      excluded_financial_api: excludedFinancialApi.length,
      matched: matched.length,
      documents_read: readDocuments,
    },
    matched,
    excluded: {
      not_field: excludedNotField,
      financial_api: excludedFinancialApi,
    },
  };

  saveCache(isoDate, result);
  onProgress({ phase: 'done', message: `Done — ${matched.length} matched`, matched: matched.length });
  return result;
}

module.exports = { scanClosingDate, loadCache, cachePath, saveCache };
