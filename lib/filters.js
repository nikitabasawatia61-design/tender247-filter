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

/** Goods supply — split into hardware vs software supply tabs */
const SUPPLY_HARDWARE_KEYWORDS = [
  'computer', 'desktop', 'workstation', 'all in one', 'all-in-one', 'laptop', 'notebook',
  'tablet', 'ipad', 'macbook', 'monitor', 'display', 'led tv', 'television',
  'printer', 'multifunction printer', 'photocopier', 'xerox', 'scanner', 'plotter',
  'dot matrix printer', 'line matrix printer', 'label printer', 'tube printer',
  'toner', 'cartridge', 'ink bottle', 'drum', 'fuser', 'printer head', 'ribbon', 'refill',
  'interactive panel', 'smart class', 'projector', 'ict lab', 'digital contents',
  'video conferencing', 'vc camera', 'lectern', 'plc', 'hmi', 'drone', 'simulator',
  'cctv', 'camera', 'electronics', 'peripheral', 'computer consumables',
  'stationery', 'paper', 'files', 'pens', 'envelopes', 'office supplies',
  'furniture', 'chairs', 'tables', 'cleaning materials', 'brooms', 'phenyl', 'harpic',
  'bleaching powder', 'cotton', 'bamboo', 'kitchen items', 'food items',
  'server', 'servers', 'computer spares', 'desktop computer spares', 'computers set',
  'supply of desktop', 'procurement of desktop', 'procurement of computers',
  'supply of computer spares', 'supply of computer set', 'procurement of desktop pc',
  'supply of - high end laptop', 'supply of - entry and mid level laptop',
  'supply of - high end desktop', 'supply of - entry and mid level desktop',
  'supply of - servers', 'supply of - server', ' nos. scanner', 'supply of scanner',
  'procurement of scanner', 'omr scanner', 'digital dongle', ' dongle',
  'passbook or bankbook printer', 'firewall (v4)', 'supply of - firewall',
  'supply of - ups ', 'supply of - camera for cctv', 'digital input board',
  'supply and installation of  server  laptop  desktop', 'high performance enterprise ai compute server',
  'supply of commissioning of smart class room', 'supply of requied materials like cartridges',
  'interested institutions for the replacement of toner', 'printer toner', 'toner cartridge',
  'toner refill', 'hp samsung printer', 'hp toner', 'ink cartridge',
  'purchase of furniture', 'purchase of furn', 'interior furn', 'interior furnishing',
  'micro processor based', 'supply of - white paint', 'bottom loading arms',
  'supply of - push rod', 'supply of - fuel motor',
  'annual maintenance service - desktops, laptops',
  'comprehensive annual maintenance contract of computer hardware',
  'camc for maintenance and service of computer hardware',
  'pc', 'mfp', 'ink', 'ups', 'vc',
];

const SUPPLY_SOFTWARE_KEYWORDS = [
  'supply of - office suite software', 'supply of - redhat enterprise linux',
  'supply of - designing software', 'supply of - graphics suite software',
  'sphera lea software', 'renewal of airtime and software subscription', 'microsoft office 2024',
  'fresh subscription of the fortigate', 'software subscription', 'supply of software',
  'procurement of software', 'purchase of software', 'software license', 'license software',
  'supply of license', 'procurement of license', 'antivirus', 'anti-virus', 'anti virus',
  'autodesk', 'adobe creative', 'oracle license', 'sql server license', 'vmware',
  'windows server standard', 'windows server datacenter', 'cad software', 'supply of - antivirus',
  'supply of - cad', 'supply of - autodesk', 'renewal of software', 'subscription of software',
  'supply of - microsoft', 'supply of - adobe', 'supply of - oracle',
];

/** Legacy + catch-all supply phrases */
const SUPPLY_BRIEF = [
  ...SUPPLY_HARDWARE_KEYWORDS,
  ...SUPPLY_SOFTWARE_KEYWORDS,
];

const SUPPLY_KEYWORD_WORD_BOUNDARY = new Set([
  'pc', 'ink', 'drum', 'plc', 'hmi', 'cctv', 'mfp', 'vc', 'ups', 'tv', 'paper', 'pens',
  'files', 'cotton', 'bamboo', 'ribbon', 'refill', 'toner', 'scanner', 'printer', 'tablet',
  'display', 'monitor', 'projector', 'drone', 'simulator', 'camera', 'electronics',
  'furniture', 'chairs', 'tables', 'brooms', 'phenyl', 'harpic', 'xerox', 'plotter',
  'cartridge', 'workstation', 'notebook', 'macbook', 'ipad', 'lectern', 'server', 'servers',
]);

function supplyKeywordMatch(t, keyword) {
  const k = String(keyword).toLowerCase().trim();
  if (!k) return false;
  if (SUPPLY_KEYWORD_WORD_BOUNDARY.has(k)) {
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return re.test(t);
  }
  return t.includes(k);
}

function findSupplyKeywordHit(t, keywords) {
  return keywords.find((kw) => supplyKeywordMatch(t, kw)) || null;
}

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

  if (findSupplyKeywordHit(t, SUPPLY_SOFTWARE_KEYWORDS)) return true;
  if (findSupplyKeywordHit(t, SUPPLY_HARDWARE_KEYWORDS)) return true;

  if (t.includes('supply of - ')) return true;
  if (/\b(purchase|procurement) of\b/.test(t)) return true;
  if (/\bsupply of\b/.test(t)) return true;

  return false;
}

/** hardware | software */
function classifySupplyType(item) {
  const t = normalizeBrief(item);

  const swHit = findSupplyKeywordHit(t, SUPPLY_SOFTWARE_KEYWORDS);
  if (swHit) return 'software';

  if (/\b(supply|procurement|purchase) of\b.*\bsoftware\b/.test(t)) return 'software';
  if (/\bsoftware\b.*\b(license|subscription|renewal)\b/.test(t)) return 'software';
  if (/\b(license|subscription|renewal)\b.*\bsoftware\b/.test(t)) return 'software';

  const hwHit = findSupplyKeywordHit(t, SUPPLY_HARDWARE_KEYWORDS);
  if (hwHit) return 'hardware';

  return 'hardware';
}

function getSupplyReason(item) {
  const t = normalizeBrief(item);
  const type = classifySupplyType(item);
  const swHit = findSupplyKeywordHit(t, SUPPLY_SOFTWARE_KEYWORDS);
  const hwHit = findSupplyKeywordHit(t, SUPPLY_HARDWARE_KEYWORDS);
  const hit = swHit || hwHit;

  if (hit) {
    return `Supply ${type} (${String(hit).slice(0, 40)}…)`;
  }
  if (t.includes('supply of - ')) return `Supply ${type} (GeM catalog item)`;
  if (/\bpurchase of\b/.test(t)) return `Supply ${type} (purchase of goods)`;
  if (/\bprocurement of\b/.test(t)) return `Supply ${type} (procurement of goods)`;
  if (/\bsupply of\b/.test(t)) return `Supply ${type} (supply of goods)`;
  return `Supply ${type}`;
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
  SUPPLY_HARDWARE_KEYWORDS,
  SUPPLY_SOFTWARE_KEYWORDS,
  isFieldRelated,
  getExcludeReason,
  isSupplyRelated,
  getSupplyReason,
  classifySupplyType,
  apiFinancialExclude,
  enrichFromDocuments,
  fmtMoney,
  toApiClosingDate,
  fromApiClosingDate,
  getApiValue,
  getApiEmd,
};
