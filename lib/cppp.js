const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CACHE_FILE = path.join(__dirname, '..', 'cppp_cache.json');

function requestJson(url, opts = {}) {
  const lib = url.startsWith('https') ? https : http;
  const method = opts.method || 'GET';
  const headers = {
    accept: 'application/json',
    'user-agent': 'tender247-filter/1.0',
    ...(opts.headers || {}),
  };
  const body = opts.body ? JSON.stringify(opts.body) : null;
  if (body) headers['content-type'] = 'application/json';

  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      { method, headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            reject(new Error(`CPPP API returned non-JSON (HTTP ${res.statusCode})`));
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Normalise one tender row from CPPP / your scraper / API */
function mapCpppTender(raw, orgHint = '') {
  const title =
    raw.title ||
    raw.tender_title ||
    raw.TenderTitle ||
    raw.work_description ||
    raw.brief ||
    '';
  const tenderId =
    raw.tender_id ||
    raw.tenderId ||
    raw.TenderID ||
    raw.id ||
    raw.reference_no ||
    raw.ReferenceNo ||
    raw.tender_ref_no ||
    '';
  const org =
    raw.organisation ||
    raw.organization ||
    raw.organisation_name ||
    raw.OrganisationName ||
    raw.org_name ||
    orgHint ||
    '';
  let detailUrl = raw.detail_url || raw.detailUrl || raw.url || raw.tender_url || '';
  if (detailUrl && !detailUrl.startsWith('http')) {
    detailUrl = `https://eprocure.gov.in${detailUrl.startsWith('/') ? '' : '/'}${detailUrl}`;
  }
  if (!detailUrl && tenderId) {
    detailUrl = `https://eprocure.gov.in/eprocure/app?page=FrontEndTenderDetails&service=page&tid=${encodeURIComponent(tenderId)}`;
  }

  return {
    tender_id: String(tenderId || title.slice(0, 40)),
    reference_no: raw.reference_no || raw.ReferenceNo || raw.ref_no || '',
    title: String(title).replace(/\s+/g, ' ').trim(),
    organisation: String(org).replace(/\s+/g, ' ').trim(),
    published_date: raw.published_date || raw.e_published_date || raw.PublishedDate || '',
    closing_date: raw.closing_date || raw.bid_submission_closing_date || raw.ClosingDate || '',
    opening_date: raw.opening_date || raw.tender_opening_date || raw.OpeningDate || '',
    value: raw.value || raw.estimated_cost || raw.tender_value || 0,
    detail_url: detailUrl,
    source: 'cppp',
  };
}

function mapCpppOrganisation(raw, index = 0) {
  return {
    org_id: String(raw.org_id || raw.organisation_id || raw.id || raw.sno || index + 1),
    name: raw.name || raw.organisation_name || raw.OrganisationName || raw.org_name || '',
    tender_count: Number(raw.tender_count || raw.TenderCount || raw.count || 0),
    org_link: raw.org_link || raw.link || '',
    source: 'cppp',
  };
}

function extractArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const keys = ['tenders', 'Tenders', 'Data', 'data', 'items', 'results', 'Records', 'records'];
  for (const k of keys) {
    if (Array.isArray(payload[k])) return payload[k];
  }
  if (Array.isArray(payload.organisations)) return payload.organisations;
  if (Array.isArray(payload.organizations)) return payload.organizations;
  return [];
}

/** Pull from CPPP_API_URL — configure when you share your API */
async function fetchFromConfiguredApi() {
  const url = process.env.CPPP_API_URL;
  if (!url) {
    throw new Error(
      'CPPP not configured. Use the captcha search on /cppp.html, set CPPP_API_URL, or POST to /api/cppp/ingest'
    );
  }

  const method = (process.env.CPPP_API_METHOD || 'GET').toUpperCase();
  let headers = {};
  if (process.env.CPPP_API_HEADERS) {
    try {
      headers = JSON.parse(process.env.CPPP_API_HEADERS);
    } catch {
      throw new Error('CPPP_API_HEADERS must be valid JSON');
    }
  }
  if (process.env.CPPP_API_TOKEN) {
    headers.authorization = headers.authorization || `Bearer ${process.env.CPPP_API_TOKEN}`;
  }

  let body;
  if (process.env.CPPP_API_BODY) {
    try {
      body = JSON.parse(process.env.CPPP_API_BODY);
    } catch {
      throw new Error('CPPP_API_BODY must be valid JSON');
    }
  }

  const allTenders = [];
  const allOrgs = [];
  const maxPages = Number(process.env.CPPP_API_MAX_PAGES || 20);

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = url.includes('{page}') ? url.replace('{page}', String(page)) : url;
    const pageBody = body ? { ...body, page_no: page, page } : undefined;
    const res = await requestJson(pageUrl, { method, headers, body: pageBody });
    if (res.status >= 400) {
      throw new Error(`CPPP API HTTP ${res.status}`);
    }

    const payload = res.data;
    const tenders = extractArray(payload);
    const orgs = payload.organisations || payload.organizations || payload.Organisations || [];

    if (Array.isArray(orgs) && orgs.length) {
      allOrgs.push(...orgs.map((o, i) => mapCpppOrganisation(o, allOrgs.length + i)));
    }

    if (!tenders.length) break;
    for (const t of tenders) {
      allTenders.push(mapCpppTender(t));
    }

    if (tenders.length < Number(process.env.CPPP_API_PAGE_SIZE || 50)) break;
  }

  return { organisations: allOrgs, tenders: allTenders };
}

function loadLocalDataFile() {
  const file = process.env.CPPP_DATA_FILE;
  if (!file || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return null;
  return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
}

function saveCache(data) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  CACHE_FILE,
  mapCpppTender,
  mapCpppOrganisation,
  fetchFromConfiguredApi,
  loadLocalDataFile,
  loadCache,
  saveCache,
  extractArray,
};
