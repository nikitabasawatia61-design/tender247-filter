#!/usr/bin/env node
const express = require('express');
const path = require('path');
const { scanClosingDate, loadCache } = require('./lib/scanner');

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

app.listen(PORT, HOST, () => {
  const credsOk = process.env.T247_EMAIL && process.env.T247_PASSWORD;
  console.log(`Tender Filter App → http://localhost:${PORT}`);
  console.log(
    credsOk
      ? 'Credentials loaded — ready to scan.'
      : 'Set T247_EMAIL and T247_PASSWORD in this terminal before scanning.'
  );
});
