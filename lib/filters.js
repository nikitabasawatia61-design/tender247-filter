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

/** IT work phrases — if present, do not treat as goods supply */
const IT_WORK_PHRASES = [
  'software development', 'development of software', 'application development',
  'website development', 'web development', 'web portal', 'mobile app',
  'implementation of erp', 'implementation of software', 'customization of',
  'annual maintenance of software', 'amc of software', 'maintenance of software',
  ' hiring ', 'manpower', 'consultancy service', 'professional service for',
  'agency for development', 'agency for it', 'managed service provider',
  'cloud migration', 'data center migration', 'vapt', 'penetration test',
  'managed cloud', 'cloud hosting', 'hosting service', 'supply of service',
];

/** Brief text patterns to exclude entirely (not software/web field) */
const EXCLUDE_BRIEF = [
  'corrigendum',
  'installation',
  'solar power', 'on-grid ground mounted', '110 kw solar',
  'scada system', 'scada automation', 'remote monitoring by scada',
  'amc of integrated security',
  'abt metering', 'maintenance of abt metering',
  'facility management services - lumpsum',
  'construction of', 'c/o modern digital library near main library i/c water supply',
  'corrigendum : construction', 'super specialty block basement',
  'preparing all necessary site maps, designs, and cost estimates (including rcc work)',
  'steel dustbins', 'beautification and redevelopment',
  'work pertaining to the provision of essential infrastructure',
  'annapurna rasoi',
  'field validation and jurisdiction finalisation', 'dgps/total station survey',
  'operation of mep system, stage craft', 'energy efficiency improvement and effective remote monitoring',
  'repair and overhauling service',
  'procurement of various items:- dry ration',
  'supply of items : food stuffs',
];

/** Goods / hardware supply — separate tab, not matched */
const SUPPLY_BRIEF = [
  'purchase of furniture', 'purchase of furn',
  'supply of - servers', 'supply of - server',
  'printer toner', 'toner cartridge', 'toner refill', 'hp samsung printer', 'hp toner', 'ink cartridge',
  'supply of - high end laptop', 'supply of - entry and mid level laptop',
  'supply of - high end desktop', 'supply of - entry and mid level desktop',
  'supply of desktop', 'procurement of desktop', 'procurement of computers',
  'computer spares', 'desktop computer spares', 'supply of computer spares',
  'computers set', 'supply of computer set',
  'amc of integrated security', 'comprehensive annual maintenance contract of computer hardware',
  'camc for maintenance and service of computer hardware', 'camc for maintenance and services of computer hardware',
  'annual maintenance service - desktops, laptops',
  'interior furn', 'interior furnishing',
  'supply of - white paint', 'bottom loading arms', 'omr scanner',
  ' nos. scanner', 'supply of scanner', 'procurement of scanner',
  'digital dongle', ' dongle',
  'passbook or bankbook printer', 'firewall (v4)', 'supply of - firewall',
  'micro processor based', 'supply of - camera for cctv', 'digital input board',
  'supply and installation of  server  laptop  desktop', 'procurement of desktop pc',
  'supply of commissioning of smart class room', 'high performance enterprise ai compute server',
  'supply of requied materials like cartridges', 'interested institutions for the replacement of toner',
  'supply of - ups ', 'supply of - push rod', 'supply of - fuel motor',
  'supply of - office suite software', 'supply of - redhat enterprise linux',
  'supply of - designing software', 'sphera lea software',
  'renewal of airtime and software subscription', 'microsoft office 2024',
  'fresh subscription of the fortigate', 'supply of - graphics suite software , computer',
];

function normalizeBrief(item) {
  return (item.brief || item.requirement_workbrief || item.tender_brief || '').toLowerCase();
}

function isItWorkBrief(t) {
  return IT_WORK_PHRASES.some((p) => t.includes(p));
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

/** Supply / purchase / procurement of goods (hardware, furniture, licenses, GeM catalog) */
function isSupplyRelated(item) {
  const t = normalizeBrief(item);
  if (isItWorkBrief(t)) return false;

  const hit = SUPPLY_BRIEF.find((p) => t.includes(p));
  if (hit) return true;

  // GeM catalog: "supply of - servers", "supply of - laptop", etc.
  if (t.includes('supply of - ')) return true;

  if (/\b(purchase|procurement) of\b/.test(t)) return true;

  if (/\bsupply of\b/.test(t)) return true;

  return false;
}

function getSupplyReason(item) {
  const t = normalizeBrief(item);
  const hit = SUPPLY_BRIEF.find((p) => t.includes(p));
  if (hit) return `Supply (${hit.slice(0, 45)}…)`;
  if (t.includes('supply of - ')) return 'Supply (GeM catalog item)';
  if (/\bpurchase of\b/.test(t)) return 'Supply (purchase of goods)';
  if (/\bprocurement of\b/.test(t)) return 'Supply (procurement of goods)';
  if (/\bsupply of\b/.test(t)) return 'Supply (supply of goods)';
  return 'Supply related';
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
  SUPPLY_BRIEF,
  isFieldRelated,
  getExcludeReason,
  isSupplyRelated,
  getSupplyReason,
  apiFinancialExclude,
  enrichFromDocuments,
  fmtMoney,
  toApiClosingDate,
  fromApiClosingDate,
  getApiValue,
  getApiEmd,
};
