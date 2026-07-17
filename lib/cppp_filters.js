/** IT / software tender matching for CPPP (eprocure.gov.in) */

const {
  EXCLUDE_BRIEF,
  isFieldRelated,
  getExcludeReason,
  isSupplyRelated,
  getSupplyReason,
  classifySupplyType,
  apiFinancialExclude,
} = require('./filters');

const CPPP_IT_KEYWORDS = [
  'software development', 'development of software', 'custom software',
  'website development', 'web development', 'web site development', 'website dev',
  'web portal', 'portal development', 'portal design', 'portal hosting',
  'website maintenance', 'web maintenance', 'website upgradation', 'website revamp',
  'maintenance of website', 'maintenance of web portal', 'annual maintenance of website',
  'chatbot', 'chat bot', 'virtual assistant', 'conversational ai',
  'mobile app', 'mobile application', 'android app', 'ios app',
  'application development', 'app development', 'web application',
  'erp implementation', 'erp customization', 'implementation of erp',
  'content management system', 'learning management system',
  'e-governance', 'e governance', 'computerization', 'digitization', 'digitalization',
  'digital platform', 'saas', 'cloud migration', 'hosting of application',
  'vapt', 'penetration test', 'security audit', 'cyber security audit',
  'database management', 'data centre', 'data center', 'bi tool', 'business intelligence',
  'api integration', 'system integration', 'it consultancy', 'it consulting',
  'managed service provider', 'amc of software', 'maintenance of software', 'software amc',
  'hire of agency for it', 'hiring of agency for it', 'it outsourcing',
  'hiring of agency for development', 'agency for it application',
  'source code', 'ui ux', 'ui/ux', 'human computer interaction',
  'artificial intelligence', 'machine learning', 'ml model',
  'blockchain', 'iot platform', 'document management system',
  'accounting software', 'hospital information system', 'his software',
  'e-office', 'workflow automation', 'rpa ',
  'it application development', 'application development and maintenance',
  'development and maintenance of software', 'development and maintenance of application',
  'official website', 'revamping of website', 'upgradation of website',
  'tender evaluation system', 'evaluation system',
];

/** Short tokens — word-boundary match only (avoids "site office" → e office) */
const CPPP_IT_WORDS = [
  'software', 'website', 'chatbot', 'computerization', 'saas', 'erp',
  'cms', 'crm', 'lms', 'vapt',
];

/** Extra CPPP-only exclusions (non-IT work that slips past generic rules) */
const CPPP_EXCLUDE_KEYWORDS = [
  'supply of - ', 'supply of desktop', 'supply of laptop', 'supply of printer',
  'procurement of desktop', 'procurement of computer hardware', 'purchase of furniture',
  'construction of', 'civil work', 'supply of toner', 'supply of cartridge',
  'annual maintenance of printer', 'amc of printer', 'supply of server',
  'procurement of servers', 'high performance enterprise ai compute server',
  'national highway', 'repair of bituminous', 'performance based maintenance contract',
  'borewell', 'cafeteria service', 'camc of dg', 'dg set', 'dg sets',
  'harbour mobile crane', 'weigh scale', 'chemiluminescence', 'vrv/', 'vrf ',
  'scada system', 'scada automation', 'centralized control and monitoring',
  'centralised control and monitoring', 'smart warehouse electrical',
  'modular furniture', 'external putty', 'painting and providing',
  'strengthening and repairs', 'improvement of road', 'stillling basin',
  'power sockets for ai senso', 'kiosk/outlet',
  'development of berth', 'development of dock', 'development of stage',
  'development of garden', 'development of archaeological', 'skill development centre',
  'redevelopment of berth', 'integrated development and mechanization',
  'water proofing', 'north dock complex', 'dry bulk cargo', 'liquid bulk cargo',
  'independent engineer services', 'project management consultancy',
  'annual maintenance contract of internal elect', 'deployment of manpower',
  'wide angle viewing system', 'maritime skill',
  'robotic surgical', 'spectrometer', 'seismic data', 'seismic and',
  'gravity magnetic', 'broadband seismic', ' adit', 'adit-', 'river training',
  'spiral casing', 'protective coating', 'surface protective', 'emccd',
  'vessel sealing', 'radiofrequency cutting', 'coagulation and vessel',
  'hardware and software', 'carpet design software',
  'restoration/repair of the damaged access roads',
];

const IT_WORK_PHRASES = [
  'software development', 'development of software', 'application development',
  'website development', 'web development', 'web portal', 'mobile app',
  'implementation of erp', 'implementation of software', 'customization of',
  'annual maintenance of software', 'amc of software', 'maintenance of software',
  'agency for development', 'agency for it', 'managed service provider',
  'cloud migration', 'data center migration', 'vapt', 'penetration test',
  'managed cloud', 'cloud hosting', 'hosting service',
  'evaluation system', 'tender evaluation', 'automated processing',
  'ai based', 'eoi for procurement', 'end to end automated',
  'hiring of professionals for application', 'hiring of agency for it',
  'it application development', 'empanelment of agencies for it',
];

function normalizeTitle(item) {
  return (
    item.title ||
    item.tender_title ||
    item.brief ||
    item.work_description ||
    item.tender_brief ||
    ''
  )
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseMatch(text, phrase) {
  const p = phrase.trim().toLowerCase();
  if (!p) return false;
  if (p.length <= 4 && !p.includes(' ')) {
    return new RegExp(`\\b${escapeRe(p)}\\b`, 'i').test(text);
  }
  return text.includes(p);
}

function wordMatch(text, word) {
  return new RegExp(`\\b${escapeRe(word)}\\b`, 'i').test(text);
}

function isCpppExcluded(item) {
  const t = normalizeTitle(item);
  if (!t) return true;
  if (CPPP_EXCLUDE_KEYWORDS.some((p) => t.includes(p))) return true;
  if (EXCLUDE_BRIEF.some((p) => t.includes(p))) return true;
  if (!isFieldRelated({ brief: t })) return true;
  return false;
}

function getCpppExcludeReason(item) {
  const t = normalizeTitle(item);
  const cppHit = CPPP_EXCLUDE_KEYWORDS.find((p) => t.includes(p));
  if (cppHit) return `Not in field (${cppHit.slice(0, 40)}…)`;
  return getExcludeReason({ brief: t });
}

function isCpppItSystemProcurement(t) {
  if (!/\b(eoi|rfp|rfq|request for proposal|procurement of|supply of)\b/.test(t)) return false;
  return /\b(software|erp|saas|cms|crm|lms|web portal|website|web application|mobile app|it system|information technology|insurance management solution|digital platform|data centre|data center|network infrastructure|it infrastructure|cyber security|cybersecurity|e-governance|e governance|computerization|digitization|digitisation|cloud|sap s\/4|adobe acrobat|escrow services|managed service|it company|it application|application software|ansys software|wfms|ims application|swms software|social media marketing)\b/i.test(
    t
  );
}

function findItKeywordHit(t) {
  for (const p of CPPP_IT_KEYWORDS) {
    if (phraseMatch(t, p)) return p;
  }
  for (const p of IT_WORK_PHRASES) {
    if (phraseMatch(t, p)) return p;
  }
  for (const w of CPPP_IT_WORDS) {
    if (wordMatch(t, w)) return w;
  }
  const contextual = [
    'software', 'website', 'web portal', 'web application', 'mobile app',
    'chatbot', 'computerization', 'saas', 'erp', 'vapt', 'penetration test',
    'it project', 'app dev', 'source code', 'e-content', 'bi tool',
    'accounting software', 'official website', 'digital platform',
    'automation software', 'digital signature', 'escrow',
    'hiring of professionals for application', 'hiring of agency for it',
    'information technology', 'it company', 'it services', 'it solution',
    'network operation', 'data analytics', 'cyber security', 'cybersecurity',
  ];
  for (const kw of contextual) {
    if (phraseMatch(t, kw)) return kw;
  }
  if (/\b(eoi|rfp|rfq)\b/.test(t) && /\b(it|software|web application|web portal|website)\b/.test(t)) {
    return 'EOI/RFP for IT';
  }
  if (isCpppItSystemProcurement(t)) return 'IT system procurement';
  if (/\bempanelment\b.*\b(it|software|application)\b/.test(t)) return 'IT empanelment';
  if (/\bdevelopment\b.*\b(software|web application|web portal|website|mobile app|erp|cms|crm|lms)\b/.test(t)) {
    return 'IT development';
  }
  if (/\b(software|web application|web portal|website|mobile app|erp)\b.*\bdevelopment\b/.test(t)) {
    return 'IT development';
  }
  if (/\bimplementation\b.*\b(software|erp|web application|web portal|website|cms|crm|lms|saas)\b/.test(t)) {
    return 'IT implementation';
  }
  if (/\bmaintenance\b.*\b(software|website|web portal|web application|erp|cms|crm|lms)\b/.test(t)) {
    return 'software/portal maintenance';
  }
  if (/\b(software|website|web portal|web application|erp|cms|crm|lms)\b.*\bmaintenance\b/.test(t)) {
    return 'software/portal maintenance';
  }
  return '';
}

function isCpppItTender(item) {
  const t = normalizeTitle(item);
  if (!t || isCpppExcluded(item)) return false;
  return Boolean(findItKeywordHit(t));
}

function getCpppMatchReason(item) {
  const hit = findItKeywordHit(normalizeTitle(item));
  return hit ? `IT match (${hit})` : 'IT related';
}

function toFilterItem(item) {
  const t = normalizeTitle(item);
  return {
    brief: t,
    value: item.value ?? 0,
    emd: item.emd ?? 0,
  };
}

/** Full CPPP bid pipeline: exclude → supply → financial → positive IT match */
function classifyCpppTender(raw) {
  const row = {
    ...raw,
    brief: raw.title || raw.brief || '',
  };
  const item = toFilterItem(row);

  if (isCpppExcluded(row)) {
    return { bucket: 'excluded_not_field', row: { ...row, reason: getCpppExcludeReason(row) } };
  }

  if (isSupplyRelated(item)) {
    const supplyType = classifySupplyType(item);
    return {
      bucket: supplyType === 'software' ? 'supply_software' : 'supply_hardware',
      row: {
        ...row,
        reason: getSupplyReason(item),
        supply_type: supplyType,
        supply_type_label: supplyType === 'software' ? 'Software' : 'Hardware',
      },
    };
  }

  const fin = apiFinancialExclude(item);
  if (fin) {
    return {
      bucket: 'excluded_financial_api',
      row: {
        ...row,
        reason: fin.reason,
      },
    };
  }

  if (isCpppItTender(row)) {
    return {
      bucket: 'matched',
      row: { ...row, matched: true, match_reason: getCpppMatchReason(row) },
    };
  }

  return { bucket: 'other', row: { ...row, reason: 'Not IT/software related' } };
}

module.exports = {
  CPPP_IT_KEYWORDS,
  CPPP_EXCLUDE_KEYWORDS,
  normalizeTitle,
  isCpppExcluded,
  isCpppItTender,
  getCpppMatchReason,
  classifyCpppTender,
  findItKeywordHit,
};
