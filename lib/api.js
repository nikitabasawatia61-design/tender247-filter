const https = require('https');

const HOST = 't247_api.tender247.com';

function request(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      accept: 'application/json',
      'content-type': 'application/json',
      origin: 'https://www.tender247.com',
      referer: 'https://www.tender247.com/',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(data ? { 'content-length': Buffer.byteLength(data) } : {}),
    };
    const req = https.request({ hostname: HOST, path: urlPath, method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error(`Bad JSON from ${urlPath}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function login(email, password) {
  const res = await request('POST', '/apigateway/T247ApiTender/api/auth/login', {
    email_id: email,
    password,
    device_type: 1,
  });
  if (!res?.Success) throw new Error(res?.Message || 'Login failed');
  const row = res.Data[0];
  return { token: row.token, userId: row.user_id || row.UserId };
}

function searchBody(userId, closingDate, pageNo) {
  return {
    tab_id: 2,
    tender_id: 0,
    tender_number: '',
    search_text: '',
    refine_search_text: '',
    tender_value_operator: 0,
    tender_value_from: 0,
    tender_value_to: 0,
    publication_date_from: '',
    publication_date_to: '',
    closing_date_from: closingDate,
    closing_date_to: closingDate,
    search_by_location: false,
    statezone_ids: '',
    city_ids: '',
    state_ids: '',
    organization_ids: '',
    organization_name: '',
    sort_by: 1,
    sort_type: 2,
    page_no: pageNo,
    record_per_page: 50,
    keyword_id: '',
    mfa: '',
    nameof_website: '',
    tender_typeid: 0,
    is_tender_doc_uploaded: false,
    user_id: userId,
    user_email_service_query_id: 330011,
    exact_search: false,
    exact_search_text: false,
    search_by_split_word: false,
    product_id: '',
    organization_type_id: '',
    sub_industry_id: '',
    search_by: 0,
    guest_user_id: 0,
    quantity: '',
    quantity_operator: 0,
    msme_exemption: 0,
    startup_exemption: 0,
    gem: 0,
    mail_date: '',
    tab_status: 0,
    is_ai_summary: false,
    boq: 0,
    is_grace: false,
    surety_bond: false,
    limited_tender: false,
    corrigendum_type: 0,
  };
}

async function fetchTendersByClosing(token, userId, closingDateApi) {
  const seen = new Map();
  for (let page = 1; page <= 30; page++) {
    const res = await request(
      'POST',
      '/apigateway/T247Tender/api/tender/auth/search-tender',
      searchBody(userId, closingDateApi, page),
      token
    );
    const data = res?.Data || [];
    if (!data.length) break;
    for (const item of data) {
      if (!seen.has(item.tender_id)) seen.set(item.tender_id, item);
    }
    if (data.length < 50) break;
  }
  return [...seen.values()];
}

async function getTenderDetail(tenderId, securityCode, token) {
  const res = await request(
    'POST',
    `/apigateway/T247Tender/api/tender/tender-detail/${tenderId}`,
    { guest_user_id: 0, security_code: securityCode || '', ip: '127.0.0.1' },
    token
  );
  return res?.Data?.[0] || null;
}

function mapSearchItem(item) {
  return {
    id: item.tender_id,
    security: item.security_code || '',
    num: item.tender_number || '',
    org: item.organization_name || '',
    value: item.tender_estimatedcost || 0,
    emd: item.earnest_money_deposite || 0,
    msme: item.msme_exemption || '',
    msme_exemption: item.msme_exemption || '',
    msme_exemption_flag: item.msme_exemption_flag ?? item.is_msme_exemption ?? '',
    brief: item.requirement_workbrief || item.tender_brief || item.tender_title || '',
    nameof_website: item.nameof_website || item.name_of_website || item.website_name || '',
    organization_type_id: item.organization_type_id ?? item.organizationtype_id ?? item.org_type_id ?? '',
    organization_type_name:
      item.organization_type_name ||
      item.organizationtype_name ||
      item.organization_type ||
      item.org_type_name ||
      '',
    gem_flag: item.gem ?? item.is_gem ?? item.gem_tender ?? item.isgem ?? '',
  };
}

module.exports = {
  login,
  fetchTendersByClosing,
  getTenderDetail,
  mapSearchItem,
};
