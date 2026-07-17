const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BASE = 'https://eprocure.gov.in';
const ORG_PAGE = `${BASE}/eprocure/app?page=FrontEndTendersByOrganisation&service=page`;
const POST_URL = `${BASE}/eprocure/app`;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

const SESSION_TTL_MS = 15 * 60 * 1000;
const sessions = new Map();
const CPPP_DEBUG = process.env.CPPP_DEBUG === '1' || process.env.CPPP_DEBUG === 'true';

function debugLog(...args) {
  if (CPPP_DEBUG) console.error('[cppp]', ...args);
}

function mergeCookies(existing, setCookieHeader) {
  const jar = new Map();
  for (const part of `${existing || ''}`.split(';')) {
    const p = part.trim();
    if (!p) continue;
    jar.set(p.split('=')[0], p);
  }
  const raw = setCookieHeader;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const c of list) {
    const pair = c.split(';')[0].trim();
    if (pair) jar.set(pair.split('=')[0], pair);
  }
  if (jar.has('JSESSIONID')) {
    jar.set('cookieWorked', 'cookieWorked=yes');
  }
  return [...jar.values()].join('; ');
}

async function fetchHtml(url, opts = {}) {
  const res = await fetch(url, {
    redirect: 'follow',
    method: opts.method || 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,*/*',
      'Accept-Language': 'en-IN,en;q=0.9',
      Referer: opts.referer || ORG_PAGE,
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body,
  });
  const html = await res.text();
  const cookie = mergeCookies(opts.cookie, res.headers.getSetCookie?.() || res.headers.raw?.()['set-cookie']);
  return { html, cookie, status: res.status };
}

function decodeHtmlAttr(value) {
  return (value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractInputFields(html) {
  const fields = {};
  const multi = {};
  const inputRe = /<input[^>]*\/?>/gi;
  let m;
  while ((m = inputRe.exec(html)) !== null) {
    const tag = m[0];
    const nameM = tag.match(/\bname="([^"]+)"/i);
    if (!nameM) continue;
    const name = nameM[1];
    const valueM = tag.match(/\bvalue="([^"]*)"/i);
    const value = decodeHtmlAttr(valueM ? valueM[1] : '');
    if (name === 'iterRows_2') {
      if (!multi.iterRows_2) multi.iterRows_2 = [];
      multi.iterRows_2.push(value);
    } else {
      fields[name] = value;
    }
  }
  return { fields, multi };
}

function extractSelectDefaults(html, formId = 'TendersByOrganisationForm') {
  const formMatch = html.match(new RegExp(`<form[^>]*id="${formId}"[\\s\\S]*?<\\/form>`, 'i'));
  if (!formMatch) return {};
  const defaults = {};
  const selectRe = /<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi;
  let m;
  while ((m = selectRe.exec(formMatch[0])) !== null) {
    const name = m[1];
    const selected =
      m[2].match(/<option[^>]*selected[^>]*value="([^"]*)"/i) ||
      m[2].match(/<option[^>]*value="([^"]*)"/i);
    defaults[name] = selected ? selected[1] : '0';
  }
  return defaults;
}

function extractFormState(html, formId = 'TendersByOrganisationForm') {
  // Use the <form> only — the Tapestry hidden div lives inside it; merging both
  // duplicates iterRows_2 (~241 → ~482) and breaks captcha validation on POST.
  const formMatch = html.match(new RegExp(`<form[^>]*id="${formId}"[\\s\\S]*?<\\/form>`, 'i'));
  const scope =
    formMatch?.[0] ||
    html.match(new RegExp(`id="${formId}hidden"[^>]*>([\\s\\S]*?)<\\/div>`, 'i'))?.[1] ||
    html;

  const { fields, multi } = extractInputFields(scope);
  const selects = extractSelectDefaults(html, formId);
  for (const [k, v] of Object.entries(selects)) {
    if (fields[k] === undefined) fields[k] = v;
  }
  return { fields, multi };
}

function normalizeCaptchaText(text) {
  return String(text || '').replace(/\s+/g, '').slice(0, 6);
}

function extractCaptchaImage(html) {
  const m = html.match(/id="captchaImage"[^>]*src="(data:image\/[^"]+)"/i);
  return m ? m[1].replace(/\s+/g, '') : null;
}

function buildSearchBody(fields, multi, captchaText) {
  const params = new URLSearchParams();
  const merged = {
    tenderCategory: '0',
    productCategory: '0',
    tenderExpire: '0',
    ...fields,
  };
  for (const [k, v] of Object.entries(merged)) {
    if (k === 'captchaText' || k === 'Search') continue;
    params.append(k, v ?? '');
  }
  for (const row of multi.iterRows_2 || []) {
    params.append('iterRows_2', row);
  }
  params.set('captchaText', captchaText);
  // Standard HTML submit — not Tapestry submitAsync (leave submitmode/submitname empty).
  params.append('Search', 'Search');
  return params.toString();
}

function stripHtmlComments(s) {
  return s.replace(/<!--[\s\S]*?-->/g, '');
}

function rowCells(rowHtml) {
  return [...stripHtmlComments(rowHtml).matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseOrganisationTable(html) {
  const orgs = [];
  const rowRe = /<tr[^>]*class="(?:odd|even)"[^>]*id="informal_\d+"[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    const cells = rowCells(row).map((c) => stripTags(c));
    if (cells.length < 3) continue;
    const sno = parseInt(cells[0], 10);
    const name = cells[1];
    const linkMatch = row.match(/href="([^"]+DirectLink[^"]+)"/i);
    const countMatch = row.match(/>\s*(\d+)\s*<\/a>/);
    if (!name) continue;
    orgs.push({
      sno,
      name,
      tender_count: countMatch ? parseInt(countMatch[1], 10) : 0,
      org_link: linkMatch ? decodeHtmlAttr(linkMatch[1]) : '',
    });
  }
  return orgs;
}

function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return '';
  if (pathOrUrl.startsWith('http')) return pathOrUrl;
  return `${BASE}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

function parseTitleCell(cellHtml) {
  const linkMatch = cellHtml.match(
    /<a[^>]*href="([^"]*FrontEndViewTender[^"]*)"[^>]*>([\s\S]*?)<\/a>/i
  );
  const detailUrl = linkMatch ? decodeHtmlAttr(linkMatch[1]) : '';
  let title = linkMatch ? stripTags(linkMatch[2]) : stripTags(cellHtml);
  title = title.replace(/^\[|\]$/g, '').trim();

  const afterLink = linkMatch ? cellHtml.slice(cellHtml.indexOf('</a>') + 4) : '';
  const refText = stripTags(afterLink);
  const tenderIdMatch = refText.match(/\[(\d{4}_[A-Z0-9_]+_\d+)\]/i);
  const refParts = refText.match(/\[([^\]]+)\]/g) || [];
  let reference_no = tenderIdMatch ? tenderIdMatch[1] : '';
  if (!reference_no && refParts.length) {
    reference_no = refParts[refParts.length - 1].slice(1, -1);
  }

  return {
    title: title || refText.replace(/\[[^\]]+\]/g, '').trim(),
    reference_no,
    detail_url: absoluteUrl(detailUrl),
  };
}

function isTenderListPage(html) {
  return /e-Published Date/i.test(html) && /FrontEndViewTender/i.test(html);
}

function parseTenderListHtml(html, orgName = '') {
  if (html.length < 2000 && /redirectError|CommonErrorPage/i.test(html)) {
    return [];
  }
  if (!isTenderListPage(html)) {
    return [];
  }

  const tenders = [];
  const rowRe = /<tr[^>]*class="(?:odd|even)"[^>]*id="informal_\d+"[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    if (!/FrontEndViewTender/i.test(row)) continue;

    const cells = rowCells(row);
    if (cells.length < 5) continue;

    const sno = stripTags(cells[0]);
    const published = stripTags(cells[1]);
    const closing = stripTags(cells[2]);
    const opening = stripTags(cells[3]);
    const parsed = parseTitleCell(cells[4]);
    const orgChain = cells.length > 5 ? stripTags(cells[5]) : '';
    const organisation = orgName || (orgChain.split('||')[0] || '').trim();

    if (!parsed.title && !parsed.reference_no) continue;

    tenders.push({
      tender_id: parsed.reference_no || `${organisation}-${sno}`,
      reference_no: parsed.reference_no,
      title: parsed.title,
      organisation,
      organisation_chain: orgChain,
      published_date: published,
      closing_date: closing,
      opening_date: opening,
      detail_url: parsed.detail_url,
      source: 'cppp',
    });
  }
  return tenders;
}

function getSession(sessionId) {
  const sess = sessions.get(sessionId);
  if (!sess) throw new Error('Session expired — click Refresh captcha');
  if (Date.now() - sess.createdAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    throw new Error('Session expired — click Refresh captcha');
  }
  return sess;
}

async function startOrgSession() {
  const { html, cookie, status } = await fetchHtml(ORG_PAGE);
  const { fields, multi } = extractFormState(html);
  const captchaImage = extractCaptchaImage(html);
  if (!captchaImage) {
    const hint =
      html.length < 1000
        ? 'Portal returned an error page (try again in a few seconds)'
        : 'Captcha block missing from portal HTML';
    throw new Error(`Could not load captcha — ${hint} (HTTP ${status}, ${html.length} bytes)`);
  }
  if (!fields.tokenSecret || !fields.seedids) {
    throw new Error('Portal form incomplete — refresh captcha and try again');
  }

  const sessionId = crypto.randomBytes(16).toString('hex');
  sessions.set(sessionId, { cookie, fields, multi, createdAt: Date.now() });
  return { sessionId, captchaImage };
}

async function searchOrganisations(sessionId, captchaText) {
  const text = normalizeCaptchaText(captchaText);
  if (text.length !== 6) {
    throw new Error('Captcha must be 6 characters (letters/numbers, no spaces)');
  }

  const sess = getSession(sessionId);
  const body = buildSearchBody(sess.fields, sess.multi, text);
  const { html, cookie } = await fetchHtml(POST_URL, {
    method: 'POST',
    cookie: sess.cookie,
    referer: ORG_PAGE,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    body,
  });

  sess.cookie = cookie;
  sess.lastSearchHtmlLen = html.length;

  const orgs = parseOrganisationTable(html);
  if (!orgs.length) {
    if (CPPP_DEBUG) {
      const bodyKeys = [...new URLSearchParams(body).keys()];
      const iterRowsCount = (body.match(/(?:^|&)iterRows_2=/g) || []).length;
      debugLog('search failed — POST field names:', bodyKeys.join(', '));
      debugLog('search failed — iterRows_2 count:', iterRowsCount, 'body bytes:', body.length);
      debugLog('search failed — response bytes:', html.length);
      debugLog('search failed — markers:', {
        pleaseEnterCaptcha: /Please enter Captcha/i.test(html),
        invalidCaptcha: /Invalid Captcha/i.test(html),
        sessionExpired: /session expired|session has expired/i.test(html),
        redirectError: /redirectError|CommonErrorPage/i.test(html),
        tableRows: (html.match(/id="informal_\d+"/g) || []).length,
      });
      try {
        const debugPath = path.join(__dirname, '..', 'scripts', 'debug_captcha_fail.html');
        fs.writeFileSync(debugPath, html);
        debugLog('saved response HTML to', debugPath);
      } catch {
        /* ignore debug write errors */
      }
    }
    if (/session expired|session has expired/i.test(html)) {
      throw new Error('Session expired — click Refresh captcha and try again');
    }
    if (/Please enter Captcha|Invalid Captcha/i.test(html)) {
      throw new Error('Wrong captcha — type exactly what you see (6 chars, no spaces) and search again');
    }
    throw new Error(
      `Search failed (${html.length} bytes) — refresh captcha, enter the new code, and try once`
    );
  }

  try {
    const updated = extractFormState(html);
    sess.fields = updated.fields;
    sess.multi = updated.multi;
  } catch {
    /* response may omit full form on success */
  }

  return orgs.map((o) => ({
    org_id: String(o.sno),
    name: o.name,
    tender_count: o.tender_count,
    org_link: o.org_link.startsWith('http') ? o.org_link : `${BASE}${o.org_link.startsWith('/') ? '' : '/'}${o.org_link}`,
    source: 'cppp',
  }));
}

async function fetchOrgTenders(sessionId, orgLink, orgName = '') {
  const sess = getSession(sessionId);
  const url = orgLink.startsWith('http') ? orgLink : `${BASE}${orgLink.startsWith('/') ? '' : '/'}${orgLink}`;
  const { html, cookie } = await fetchHtml(url, {
    cookie: sess.cookie,
    referer: ORG_PAGE,
  });
  sess.cookie = cookie;

  if (html.length < 2000 && /redirectError|CommonErrorPage/i.test(html)) {
    throw new Error('Session expired or invalid org link — refresh captcha and search again');
  }

  const tenders = parseTenderListHtml(html, orgName);
  if (!tenders.length && !isTenderListPage(html)) {
    throw new Error('No tender table in response — session may have expired');
  }
  return tenders;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchTendersForOrganisations(sessionId, organisations, opts = {}) {
  getSession(sessionId);
  const onProgress = opts.onProgress || (() => {});
  const delayMs = Number(opts.delayMs ?? process.env.CPPP_FETCH_DELAY_MS ?? 400);
  const maxOrgsRaw = opts.maxOrgs ?? process.env.CPPP_MAX_ORGS;
  const maxOrgs = maxOrgsRaw === undefined || maxOrgsRaw === '' || maxOrgsRaw === '0'
    ? 0
    : Number(maxOrgsRaw);

  let targets = organisations.filter((o) => o.org_link && (o.tender_count > 0 || opts.includeZeroCount));
  if (maxOrgs > 0) targets = targets.slice(0, maxOrgs);

  const tenders = [];
  const errors = [];
  let current = 0;

  for (const org of targets) {
    current += 1;
    onProgress({
      phase: 'fetch',
      current,
      total: targets.length,
      org: org.name,
      tenders_so_far: tenders.length,
      message: `Fetching ${current}/${targets.length}: ${org.name}`,
    });
    try {
      const batch = await fetchOrgTenders(sessionId, org.org_link, org.name);
      tenders.push(...batch);
    } catch (err) {
      errors.push({ org: org.name, error: err.message });
      onProgress({
        phase: 'fetch',
        current,
        total: targets.length,
        org: org.name,
        error: err.message,
        message: `Skipped ${org.name}: ${err.message}`,
      });
    }
    if (delayMs > 0 && current < targets.length) await sleep(delayMs);
  }

  onProgress({
    phase: 'fetch_done',
    total: targets.length,
    tenders: tenders.length,
    errors: errors.length,
    message: `Fetched ${tenders.length} tenders from ${targets.length} organisations`,
  });

  return { tenders, errors, orgs_fetched: targets.length };
}

module.exports = {
  startOrgSession,
  searchOrganisations,
  fetchOrgTenders,
  fetchTendersForOrganisations,
  parseOrganisationTable,
  parseTenderListHtml,
  isTenderListPage,
};
