/** Tender filtering rules for Shri Hari Engineering Group */

const MAX_TENDER_VALUE = 10_000_000; // ₹1 Cr
const MAX_EMD = 200_000; // ₹2 Lakh
const COMPANY_TURNOVER = 5_000_000; // ~₹50 Lakh

const FIELD_KEYWORDS = [
  'software', 'web', 'portal', 'application', 'website', 'erp', 'cloud', 'development',
  'digital platform', 'cms', 'crm', 'lms', 'chatbot', ' ai ', 'implementation', 'saas',
  'mobile app', 'database', 'api', 'vapt', 'penetration test', 'automation software',
  'it project', 'app dev', 'source code', 'e-content', 'bi tool', 'analytics service',
  'document control', 'accounting software', 'management system', 'computerization',
  'hiring of professionals for application', 'hiring of agency for it', 'official website',
  'digital signature', 'escrow', 'computerization', 'eoi for revamping',
];

/** Brief text patterns to exclude (not software/web field) */
const EXCLUDE_BRIEF = [
  // User-requested word exclusions
  'corrigendum',
  'installation',
  // User-requested category exclusions
  'printer toner', 'toner cartridge', 'toner refill', 'hp samsung printer', 'hp toner', 'ink cartridge',
  'supply of - high end laptop', 'supply of - entry and mid level laptop',
  'supply of - high end desktop', 'supply of - entry and mid level desktop',
  'solar power', 'on-grid ground mounted', '110 kw solar',
  'scada system', 'scada automation', 'remote monitoring by scada',
  'amc of integrated security', 'comprehensive annual maintenance contract of computer hardware',
  'camc for maintenance and service of computer hardware', 'camc for maintenance and services of computer hardware',
  'annual maintenance service - desktops, laptops',
  'facility management services - lumpsum',
  // Civil / construction
  'construction of', 'c/o modern digital library near main library i/c water supply',
  'corrigendum : construction', 'super specialty block basement',
  'preparing all necessary site maps, designs, and cost estimates (including rcc work)',
  'steel dustbins', 'beautification and redevelopment',
  'work pertaining to the provision of essential infrastructure',
  'annapurna rasoi',
  // Other hardware / supply
  'supply of - white paint', 'bottom loading arms', 'omr scanner',
  'passbook or bankbook printer', 'firewall (v4)', 'supply of - firewall',
  'micro processor based', 'supply of - camera for cctv', 'digital input board',
  'supply and installation of  server  laptop  desktop', 'procurement of desktop pc',
  'supply of commissioning of smart class room', 'high performance enterprise ai compute server',
  'field validation and jurisdiction finalisation', 'dgps/total station survey',
  'operation of mep system, stage craft', 'energy efficiency improvement and effective remote monitoring',
  'supply of requied materials like cartridges', 'repair and overhauling service',
  'supply of - ups ', 'supply of - push rod', 'supply of - fuel motor',
  'interested institutions for the replacement of toner',
  'procurement of various items:- dry ration',
  'supply of items : food stuffs',
  // License-only / not dev work
  'supply of - office suite software', 'supply of - redhat enterprise linux',
  'supply of - designing software', 'sphera lea software',
  'renewal of airtime and software subscription', 'microsoft office 2024',
  'fresh subscription of the fortigate', 'supply of - graphics suite software , computer',
];

function normalizeBrief(item) {
  return (item.brief || item.requirement_workbrief || item.tender_brief || '').toLowerCase();
}

/**
 * Software profile (query 330011) is already IT-focused — exclude bad categories only.
 * Do not require a positive keyword match (too many valid tenders miss keywords).
 */
function isFieldRelated(item) {
  const t = normalizeBrief(item);
  if (EXCLUDE_BRIEF.some((p) => t.includes(p))) return false;
  return true;
}

function getExcludeReason(item) {
  const t = normalizeBrief(item);
  const hit = EXCLUDE_BRIEF.find((p) => t.includes(p));
  return hit ? `Not in field (${hit.slice(0, 40)}…)` : 'Not software/web/IT related';
}

function getApiValue(item) {
  return item.value ?? item.tender_estimatedcost ?? 0;
}

function getApiEmd(item) {
  return item.emd ?? item.earnest_money_deposite ?? 0;
}

function apiFinancialExclude(item) {
  const value = getApiValue(item);
  const emd = getApiEmd(item);
  if (value > MAX_TENDER_VALUE) return { reason: 'Value > ₹1 Cr (API)', value, emd };
  if (emd > MAX_EMD) return { reason: 'EMD > ₹2 Lakh (API)', value, emd };
  return null;
}

/** Document fields for display/notes only — never used to exclude tenders */
function enrichFromDocuments(docFields, detail, apiItem) {
  const notes = [];
  const warnings = [];

  const value =
    docFields.value?.rupees ||
    detail?.tender_estimatedcost ||
    getApiValue(apiItem) ||
    0;
  const emd =
    docFields.emd?.rupees ||
    detail?.earnest_money_deposite ||
    getApiEmd(apiItem) ||
    0;

  if (docFields.experienceYears) notes.push(`${docFields.experienceYears} yr experience`);
  if (docFields.turnover?.raw) notes.push(`Turnover (doc): ${docFields.turnover.raw}`);
  if (docFields.value?.raw) notes.push(`Value (doc): ${docFields.value.raw}`);
  if (docFields.emd?.raw) notes.push(`EMD (doc): ${docFields.emd.raw}`);
  if (docFields.msmeMentioned) notes.push('MSME clause');

  if (value > MAX_TENDER_VALUE) warnings.push('Doc/API value > ₹1 Cr — verify on portal');
  if (emd > MAX_EMD) warnings.push('Doc/API EMD > ₹2 L — verify on portal');

  return { value, emd, notes, warnings };
}

function fmtMoney(v) {
  if (!v || v <= 0) return 'Refer Document';
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} Lakh`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(0)} K`;
  return `₹${v}`;
}

/** API closing date: MM-DD-YYYY */
function toApiClosingDate(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${m}-${d}-${y}`;
}

function fromApiClosingDate(apiDate) {
  const [m, d, y] = apiDate.split('-');
  return `${y}-${m}-${d}`;
}

module.exports = {
  MAX_TENDER_VALUE,
  MAX_EMD,
  COMPANY_TURNOVER,
  FIELD_KEYWORDS,
  EXCLUDE_BRIEF,
  isFieldRelated,
  getExcludeReason,
  apiFinancialExclude,
  enrichFromDocuments,
  fmtMoney,
  toApiClosingDate,
  fromApiClosingDate,
  getApiValue,
  getApiEmd,
};
