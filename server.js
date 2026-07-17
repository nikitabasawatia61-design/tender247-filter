#!/usr/bin/env node
const express = require('express');
const path = require('path');
const { scanClosingDate, loadCache } = require('./lib/scanner');
const { scanCppp, ingestCpppData, loadCache: loadCpppCache, buildResult } = require('./lib/cppp_scanner');
const {
  startOrgSession,
  searchOrganisations,
  fetchOrgTenders,
  fetchTendersForOrganisations,
} = require('./lib/cppp_eprocure');

const app = express();
const PORT = process.env.PORT || 3847;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getCredentials() {
  const email = process.env.T247_EMAIL;
  const password = process.env.T247_PASSWORD;
  if (!email || !password) {
    throw new Error('Set T247_EMAIL and T247_PASSWORD environment variables before scanning.');
  }
  return { email, password };
}

/** GET cached result for a closing date (YYYY-MM-DD) */
app.get('/api/cache/:isoDate', (req, res) => {
  const cached = loadCache(req.params.isoDate);
  if (!cached) return res.status(404).json({ error: 'No cached scan for this date' });
  res.json(cached);
});

/** POST scan — body: { closingDate: "2026-07-17", readDocuments: true } */
app.post('/api/scan', async (req, res) => {
  const { closingDate, readDocuments = true } = req.body || {};
  if (!closingDate || !/^\d{4}-\d{2}-\d{2}$/.test(closingDate)) {
    return res.status(400).json({ error: 'closingDate required as YYYY-MM-DD' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { email, password } = getCredentials();
    await scanClosingDate(closingDate, {
      email,
      password,
      readDocuments: Boolean(readDocuments),
      concurrency: Number(process.env.T247_CONCURRENCY || 3),
      onProgress: (p) => send({ type: 'progress', ...p }),
    });
    send({ type: 'complete', closingDate });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }

  res.end();
});

/** Quick metadata-only scan (no SSE) */
app.post('/api/scan/quick', async (req, res) => {
  try {
    const { closingDate } = req.body || {};
    if (!closingDate) return res.status(400).json({ error: 'closingDate required' });
    const { email, password } = getCredentials();
    const result = await scanClosingDate(closingDate, {
      email,
      password,
      readDocuments: false,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET fresh captcha session for eprocure.gov.in org search */
app.get('/api/cppp/session', async (req, res) => {
  try {
    const session = await startOrgSession();
    res.json(session);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/** POST fetch tenders for one org — body: { sessionId, org_link, org_name? } */
app.post('/api/cppp/fetch-org', async (req, res) => {
  try {
    const { sessionId, org_link, org_name } = req.body || {};
    if (!sessionId || !org_link) {
      return res.status(400).json({ error: 'sessionId and org_link required' });
    }

    const fetched = await fetchOrgTenders(sessionId, org_link, org_name || '');
    const existing = loadCpppCache();
    const organisations = existing?.organisations || [];
    const tenders = [...(existing?.tenders || []), ...fetched];

    const result = ingestCpppData(
      { organisations, tenders },
      { fetch_mode: 'eprocure', sessionId }
    );
    res.json({ ...result, fetched_count: fetched.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** POST fetch tenders from all orgs (SSE progress) — body: { sessionId, organisations } */
app.post('/api/cppp/fetch-all', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { sessionId, organisations: orgsBody } = req.body || {};
    if (!sessionId) {
      send({ type: 'error', message: 'sessionId required' });
      return res.end();
    }

    const cached = loadCpppCache();
    const organisations =
      (Array.isArray(orgsBody) && orgsBody.length ? orgsBody : null) ||
      cached?.organisations ||
      [];

    if (!organisations.length) {
      send({ type: 'error', message: 'No organisations — search organisations first' });
      return res.end();
    }

    send({
      type: 'progress',
      phase: 'start',
      message: `Fetching tenders from ${organisations.length} organisations…`,
      total: organisations.length,
    });

    const { tenders, errors, orgs_fetched } = await fetchTendersForOrganisations(
      sessionId,
      organisations,
      {
        maxOrgs: 0,
        onProgress: (p) => send({ type: 'progress', ...p }),
      }
    );

    const result = ingestCpppData(
      { organisations, tenders },
      { fetch_mode: 'eprocure_all', sessionId, fetch_errors: errors }
    );

    send({
      type: 'complete',
      ...result,
      fetched_count: tenders.length,
      orgs_fetched,
      fetch_errors: errors,
    });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }

  res.end();
});

/** POST org search after captcha — body: { sessionId, captchaText, fetchTenders?: bool } */
app.post('/api/cppp/search-orgs', async (req, res) => {
  try {
    const { sessionId, captchaText, fetchTenders = false } = req.body || {};
    if (!sessionId || !captchaText) {
      return res.status(400).json({ error: 'sessionId and captchaText required' });
    }

    const organisations = await searchOrganisations(sessionId, captchaText);
    let tenders = [];

    if (fetchTenders) {
      const { tenders: fetched } = await fetchTendersForOrganisations(sessionId, organisations, {
        maxOrgs: 10,
      });
      tenders = fetched;
    }

    const result = ingestCpppData(
      { organisations, tenders },
      { fetch_mode: 'eprocure', sessionId }
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** GET cached CPPP scrape (re-applies current filter rules) */
app.get('/api/cppp/cache', (req, res) => {
  const cached = loadCpppCache();
  if (!cached) return res.status(404).json({ error: 'No CPPP data yet — fetch or ingest first' });
  const result = buildResult(
    { organisations: cached.organisations || [], tenders: cached.tenders || [] },
    {
      fetch_mode: cached.fetch_mode,
      sessionId: cached.sessionId,
      fetch_errors: cached.fetch_errors,
    }
  );
  res.json(result);
});

/** POST fetch CPPP via CPPP_API_URL (SSE progress) */
app.post('/api/cppp/fetch', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await scanCppp({
      onProgress: (p) => send({ type: 'progress', ...p }),
    });
    send({ type: 'complete' });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }

  res.end();
});

/** POST ingest scraped CPPP JSON — body: { organisations: [], tenders: [] } */
app.post('/api/cppp/ingest', (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.tenders?.length && !payload.organisations?.length) {
      return res.status(400).json({
        error: 'Send { organisations: [...], tenders: [...] } from your CPPP scraper/API',
      });
    }
    const result = ingestCpppData(payload);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, HOST, () => {
  const credsOk = process.env.T247_EMAIL && process.env.T247_PASSWORD;
  console.log(`Tender Filter App → http://localhost:${PORT}`);
  console.log(
    credsOk
      ? 'Credentials loaded — ready to scan.'
      : 'Set T247_EMAIL and T247_PASSWORD in this terminal before scanning.'
  );
});
