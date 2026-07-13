#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const pdfParse = require('pdf-parse');
const AdmZip = require('adm-zip');

const DOWNLOAD_BASE = 'https://documents.tender247.com/tender/download-document';
const DOC_PRIORITY = ['NIT', 'Tender Document', 'Corrigendum Document', 'BOQ Document'];

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
    const req = https.request(
      { hostname: 't247_api.tender247.com', path: urlPath, method, headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            reject(new Error(`Bad JSON ${res.statusCode}: ${raw.slice(0, 300)}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https
      .get(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          headers: {
            origin: 'https://www.tender247.com',
            referer: 'https://www.tender247.com/',
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              type: res.headers['content-type'],
              buffer: Buffer.concat(chunks),
            })
          );
        }
      )
      .on('error', reject);
  });
}

async function login(email, password) {
  const res = await request('POST', '/apigateway/T247ApiTender/api/auth/login', {
    email_id: email,
    password,
    device_type: 1,
  });
  if (!res.data?.Success) throw new Error(res.data?.Message || 'Login failed');
  return res.data.Data[0].token;
}

async function getDocumentList(tenderId, token) {
  const body = { guest_user_id: 0, security_code: '', ip: '127.0.0.1' };
  const res = await request(
    'POST',
    `/apigateway/T247Tender/api/tender/tender-document-list/${tenderId}`,
    body,
    token
  );
  return res.data?.Data || [];
}

function sortDocuments(docs) {
  return [...docs].sort((a, b) => {
    const ai = DOC_PRIORITY.indexOf(a.document_type_name);
    const bi = DOC_PRIORITY.indexOf(b.document_type_name);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

const PDF_NOISE = /Warning:\s*TT:|Indexing all PDF objects/;

async function withPdfNoiseSuppressed(fn) {
  const origWarn = console.warn;
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  console.warn = (...args) => {
    if (PDF_NOISE.test(args.join(' '))) return;
    origWarn(...args);
  };
  process.stderr.write = (chunk, encoding, cb) => {
    if (PDF_NOISE.test(String(chunk))) {
      if (typeof encoding === 'function') encoding();
      else if (typeof cb === 'function') cb();
      return true;
    }
    return origStderrWrite(chunk, encoding, cb);
  };
  try {
    return await fn();
  } finally {
    console.warn = origWarn;
    process.stderr.write = origStderrWrite;
  }
}

async function extractPdfText(buffer) {
  try {
    const parsed = await withPdfNoiseSuppressed(() => pdfParse(buffer));
    return parsed.text || '';
  } catch {
    return '';
  }
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(div|p|tr|li|h\d|label|span|td|th|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function docBinaryToText(buffer) {
  return buffer
    .toString('latin1')
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractZipText(buffer) {
  const texts = [];
  try {
    const zip = new AdmZip(buffer);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const name = entry.entryName.toLowerCase();
      const data = entry.getData();
      if (name.endsWith('.pdf')) {
        const text = await extractPdfText(data);
        if (text.trim()) texts.push({ file: entry.entryName, text });
      } else if (name.endsWith('.doc') || name.endsWith('.docx')) {
        const text = docBinaryToText(data);
        if (text.trim()) texts.push({ file: entry.entryName, text });
      } else if (name.endsWith('.html') || name.endsWith('.htm')) {
        const text = htmlToText(data.toString('utf8'));
        if (text.trim()) texts.push({ file: entry.entryName, text });
      }
    }
  } catch {
    /* ignore bad zip */
  }
  return texts;
}

async function downloadAndReadDoc(doc, tenderId, cacheDir) {
  const url = `${DOWNLOAD_BASE}/${doc.doc_path}?tender_id=${tenderId}`;
  const dl = await downloadFile(url);
  if (dl.status !== 200 || dl.buffer.length < 100) {
    return { doc, error: `Download failed (${dl.status})`, text: '' };
  }

  const ext = (doc.file_extension || '').toLowerCase();
  let text = '';
  const parts = [];

  if (ext === '.pdf' || (dl.type || '').includes('pdf')) {
    text = await extractPdfText(dl.buffer);
  } else if (ext === '.html' || ext === '.htm' || (dl.type || '').includes('html')) {
    text = htmlToText(dl.buffer.toString('utf8'));
  } else if (ext === '.zip' || (dl.type || '').includes('zip')) {
    parts.push(...(await extractZipText(dl.buffer)));
    text = parts.map((p) => p.text).join('\n\n');
  }

  if (cacheDir) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const safeName = `${doc.document_type_name.replace(/\W+/g, '_')}_${doc.document_id}${ext || '.bin'}`;
    fs.writeFileSync(path.join(cacheDir, safeName), dl.buffer);
    if (text) {
      fs.writeFileSync(path.join(cacheDir, safeName + '.txt'), text);
    }
  }

  return {
    doc,
    text,
    parts,
    bytes: dl.buffer.length,
  };
}

function moneyFromMatch(num, unit) {
  if (!num) return null;
  const n = parseFloat(String(num).replace(/,/g, ''));
  if (Number.isNaN(n)) return null;
  const u = (unit || '').toLowerCase();
  if (u.startsWith('cr')) return { rupees: n * 1e7, raw: `${num} ${unit || 'crore'}`.trim() };
  if (u.startsWith('la')) return { rupees: n * 1e5, raw: `${num} ${unit || 'lakh'}`.trim() };
  if (n >= 1e7) return { rupees: n, raw: `₹${n}` };
  if (n >= 1e5) return { rupees: n, raw: `₹${n}` };
  return { rupees: n, raw: `₹${n}` };
}

function extractFields(text) {
  const t = text.replace(/\s+/g, ' ');
  const lower = t.toLowerCase();

  const pickMoney = (patterns) => {
    for (const re of patterns) {
      const m = t.match(re);
      if (m) return moneyFromMatch(m[1], m[2]);
    }
    return null;
  };

  const turnover = pickMoney([
    /(?:annual\s+)?turnover[^\d]{0,40}(?:rs\.?|inr|₹)?\s*([\d,.]+)\s*(crore|cr|lakh|lac|lakhs|lacs)/i,
    /turnover\s+(?:of\s+)?(?:minimum|min\.?|at\s+least)?[^\d]{0,20}(?:rs\.?|inr|₹)?\s*([\d,.]+)\s*(crore|cr|lakh|lac|lakhs|lacs)/i,
  ]);

  const emd = pickMoney([
    /emd\s+amount[^\d]{0,20}(?:rs\.?|inr|₹)?\s*([\d,.]+)/i,
    /earnest\s+money\s+deposit[^\d]{0,40}(?:rs\.?|inr|₹)?\s*([\d,.]+)/i,
    /amount\s+of\s+earnest\s+money\s+deposit[^\d]{0,20}(?:inr)?[^\d]{0,10}([\d,.]+)/i,
    /(?:emd|earnest\s+money)[^\d]{0,40}(?:rs\.?|inr|₹)?\s*([\d,.]+)\s*(crore|cr|lakh|lac|lakhs|lacs)?/i,
  ]);

  const value = pickMoney([
    /project\s+amount\s*\(approximate\)[^\d]{0,20}(?:rs\.?|inr|₹)?\s*([\d,.]+)/i,
    /tender\s+amount\s*\(inr\)[^\d]{0,20}([\d,.]+)/i,
    /(?:estimated\s+(?:cost|value)|tender\s+value|contract\s+value)[^\d]{0,40}(?:rs\.?|inr|₹)?\s*([\d,.]+)\s*(crore|cr|lakh|lac|lakhs|lacs)/i,
  ]);

  const closing =
    t.match(/last\s+date\s+and\s+time\s+for\s+uploading[^\d]{0,40}(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i)?.[1] ||
    t.match(/(?:last\s+date|closing\s+date|bid\s+submission\s+deadline)[^\d]{0,30}(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i)?.[1] ||
    null;

  const experience =
    t.match(/(?:similar\s+)?(?:work|experience)[^\d]{0,40}(\d+)\s*(?:year|years)/i)?.[1] ||
    t.match(/experience\s+of\s+(?:at\s+least\s+)?(\d+)\s*(?:year|years)/i)?.[1] ||
    null;

  const msme =
    /msme\s+(?:exemption|benefit|preference)/i.test(t) ||
    /micro\s*,?\s*small\s*(?:and|&)\s*medium/i.test(lower);

  const scopeMatch = t.match(
    /(?:tender\s+proposal\s+for|scope\s+of\s+(?:work|services)|work\s+involves|description\s+of\s+(?:work|services))[\s:.-]{0,10}(.{80,400})/i
  );

  return {
    turnover,
    emd,
    value,
    closing,
    experienceYears: experience,
    msmeMentioned: msme,
    scopeSnippet: scopeMatch ? scopeMatch[1].trim() : null,
  };
}

async function readTenderDocuments(tenderId, token, options = {}) {
  const { cacheDir = null, maxDocs = 4 } = options;
  const docs = sortDocuments(await getDocumentList(tenderId, token));
  const read = [];

  for (const doc of docs.slice(0, maxDocs)) {
    read.push(await downloadAndReadDoc(doc, tenderId, cacheDir));
  }

  const combinedText = read.map((r) => r.text).filter(Boolean).join('\n\n');
  const fields = extractFields(combinedText);

  return {
    documentsRead: read.map((r) => ({
      type: r.doc.document_type_name,
      extension: r.doc.file_extension,
      bytes: r.bytes || 0,
      chars: (r.text || '').length,
      error: r.error || null,
      filesInZip: (r.parts || []).map((p) => p.file),
    })),
    textLength: combinedText.length,
    fields,
    textPreview: combinedText.slice(0, 2000),
    combinedText,
  };
}

module.exports = {
  readTenderDocuments,
  getDocumentList,
  downloadAndReadDoc,
  extractFields,
  DOC_PRIORITY,
};

if (require.main === module) {
  const tenderId = process.argv[2] || '101664144';
  const email = process.env.T247_EMAIL;
  const password = process.env.T247_PASSWORD;
  if (!email || !password) throw new Error('Set T247_EMAIL and T247_PASSWORD');
  const cacheDir = path.join(__dirname, 'docs', String(tenderId));

  login(email, password)
    .then((token) =>
      readTenderDocuments(Number(tenderId), token, { cacheDir, maxDocs: 4 })
    )
    .then((result) => {
      const { combinedText, ...summary } = result;
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
