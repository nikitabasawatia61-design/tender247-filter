/** Classify matched tenders into GeM / PSU / State Govt / Private buckets */

const MATCHED_CATEGORIES = ['gem_msme', 'gem', 'psu', 'state_govt', 'private'];

const CATEGORY_LABELS = {
  gem_msme: 'GeM + MSME',
  gem: 'GeM',
  psu: 'PSU',
  state_govt: 'State Govt',
  private: 'Private',
};

/** Tender247 organization_type_id → bucket (adjust if portal uses different IDs) */
const ORG_TYPE_ID_MAP = {
  1: 'psu',
  2: 'state_govt',
  3: 'private',
  4: 'state_govt',
  5: 'psu',
  6: 'private',
  7: 'state_govt',
  8: 'psu',
};

function truthyFlag(v) {
  if (v === true || v === 1 || v === '1') return true;
  const s = String(v ?? '').toLowerCase().trim();
  return s === 'yes' || s === 'y' || s === 'true';
}

function hasMsmeExemption(item) {
  if (truthyFlag(item.msme_exemption_flag)) return true;
  const v = item.msme ?? item.msme_exemption ?? '';
  if (truthyFlag(v)) return true;
  const s = String(v).toLowerCase().trim();
  if (!s || s === 'no' || s === 'n' || s === '0' || s === 'false') return false;
  return s.includes('msme') || s.includes('exempt') || s.includes('udyam');
}

function isGemTender(item) {
  if (truthyFlag(item.gem_flag ?? item.gem ?? item.is_gem)) return true;

  const website = String(item.nameof_website ?? item.name_of_website ?? item.portal ?? '').toLowerCase();
  if (website.includes('gem') || website.includes('government e marketplace')) return true;

  const num = String(item.num ?? item.tender_number ?? '').toLowerCase();
  if (num.includes('gem/') || num.startsWith('gem-')) return true;

  const brief = String(item.brief ?? '').toLowerCase();
  if (brief.includes('on gem portal') || brief.includes('gem portal')) return true;

  return false;
}

function orgTypeFromName(typeName) {
  const t = String(typeName).toLowerCase();
  if (!t) return null;
  if (t.includes('psu') || t.includes('public sector') || t.includes('central govt') && t.includes('undertaking')) {
    return 'psu';
  }
  if (t.includes('state govt') || t.includes('state government') || t.includes('state dept')) {
    return 'state_govt';
  }
  if (t.includes('private') || t.includes('corporate') || t.includes('industry')) return 'private';
  if (t.includes('central government') || t.includes('ministry') || t.includes('department')) {
    return 'psu';
  }
  if (t.includes('local body') || t.includes('municipal') || t.includes('panchayat')) {
    return 'state_govt';
  }
  return null;
}

function orgTypeFromId(typeId) {
  if (typeId == null || typeId === '') return null;
  const n = Number(typeId);
  return ORG_TYPE_ID_MAP[n] || null;
}

function orgTypeFromOrganization(org) {
  const o = String(org).toLowerCase();
  if (!o) return null;

  if (
    /\b(psu|public sector|bharat electronics|bel\b|ntpc|npcil|bsnl|railtel|power grid|nhpc|ongc|gail|iocl|hpcl|bpcl|sail\b|bcd\b|cochin shipyard|hal\b|midhani|irel|ecil|bhel|coal india|irctc|air india|airports authority|aaI\b)/.test(
      o
    )
  ) {
    return 'psu';
  }

  if (
    /government of|govt\. of|department of|directorate|commissioner|collector|district|municipal|nagar nigam|nagar palika|panchayat|secretariat|mandi board|police department|tourism development|state road|pwd\b|health department|education department|university|i\.t\. department|information technology department/.test(
      o
    )
  ) {
    return 'state_govt';
  }

  if (/private limited|pvt\.?\s*ltd|llp\b|foundation|trust\b|association|society\b|hospital\b|college\b|institute\b/.test(o)) {
    return 'private';
  }

  return null;
}

function classifyOrgCategory(item) {
  return (
    orgTypeFromName(item.organization_type_name ?? item.organization_type) ||
    orgTypeFromId(item.organization_type_id) ||
    orgTypeFromOrganization(item.org ?? item.organization) ||
    'private'
  );
}

function classifyMatchedCategory(item) {
  if (isGemTender(item)) {
    return hasMsmeExemption(item) ? 'gem_msme' : 'gem';
  }
  return classifyOrgCategory(item);
}

function summarizeMatchedCategories(rows) {
  const counts = Object.fromEntries(MATCHED_CATEGORIES.map((k) => [k, 0]));
  for (const row of rows) {
    const cat = row.category || classifyMatchedCategory(row);
    if (counts[cat] != null) counts[cat] += 1;
  }
  return counts;
}

function bucketMatchedRows(rows) {
  const buckets = Object.fromEntries(MATCHED_CATEGORIES.map((k) => [k, []]));
  for (const row of rows) {
    const cat = row.category || classifyMatchedCategory(row);
    if (buckets[cat]) buckets[cat].push(row);
    else buckets.private.push(row);
  }
  return buckets;
}

module.exports = {
  MATCHED_CATEGORIES,
  CATEGORY_LABELS,
  hasMsmeExemption,
  isGemTender,
  classifyMatchedCategory,
  summarizeMatchedCategories,
  bucketMatchedRows,
};
