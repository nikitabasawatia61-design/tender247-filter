#!/usr/bin/env node
/**
 * Tender247 login – fetches Bearer token
 *
 * Usage (PowerShell):
 *   $env:T247_EMAIL="you@example.com"
 *   $env:T247_PASSWORD="yourpassword"
 *   node login.js
 *
 * Optional:
 *   $env:T247_SAVE_TOKEN="1"   # saves token to .token file
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const LOGIN_URL_PATH = '/apigateway/T247ApiTender/api/auth/login';

const email = process.env.T247_EMAIL;
const password = process.env.T247_PASSWORD;

if (!email || !password) {
  console.error('Missing credentials. Set environment variables:');
  console.error('  T247_EMAIL');
  console.error('  T247_PASSWORD');
  process.exit(1);
}

function postLogin(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: 't247_api.tender247.com',
        path: LOGIN_URL_PATH,
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          origin: 'https://www.tender247.com',
          referer: 'https://www.tender247.com/',
          'content-length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            reject(new Error(`Unexpected response (${res.statusCode}): ${raw.slice(0, 300)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function extractLoginResult(data) {
  if (!data?.Success) {
    throw new Error(data?.Message || 'Login failed');
  }

  const row = Array.isArray(data.Data) ? data.Data[0] : data.Data;
  const token = row?.token || data.token;

  if (!token) {
    throw new Error('Login succeeded but token was not returned');
  }

  return {
    token,
    userId: row?.UserId ?? row?.user_id ?? null,
    personName: row?.PersonName ?? null,
    companyServiceIds: row?.CompanyServiceids ?? null,
    raw: data,
  };
}

async function login() {
  const body = {
    email_id: String(email),
    password: String(password),
    device_type: 1,
  };

  const res = await postLogin(body);

  if (res.status !== 200) {
    const msg = res.data?.message
      ? JSON.stringify(res.data.message)
      : JSON.stringify(res.data).slice(0, 200);
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }

  return extractLoginResult(res.data);
}

async function main() {
  const result = await login();

  console.log('Login successful');
  if (result.personName) console.log('Name:', result.personName);
  if (result.userId) console.log('User ID:', result.userId);
  console.log('\nBearer token:\n');
  console.log(result.token);

  if (process.env.T247_SAVE_TOKEN === '1') {
    const tokenFile = path.join(__dirname, '.token');
    fs.writeFileSync(tokenFile, result.token, 'utf8');
    console.log(`\nSaved to ${tokenFile}`);
  }
}

main().catch((err) => {
  console.error('Login failed:', err.message);
  process.exit(1);
});
