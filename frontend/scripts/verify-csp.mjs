import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const configPath = path.join(root, 'vercel.json');
const rawApiUrl = (process.env.VITE_API_URL || '').trim().replace(/^"|"$/g, '');

if (!rawApiUrl) {
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    console.error('[csp] VITE_API_URL is required for a production build.');
    process.exit(1);
  }
  console.log('[csp] VITE_API_URL is not set; skipping local CSP check.');
  process.exit(0);
}

let api;
try {
  api = new URL(rawApiUrl);
} catch {
  console.error(`[csp] VITE_API_URL is not a valid absolute URL: ${rawApiUrl}`);
  process.exit(1);
}
const apiOrigin = api.origin;
const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
if (isProduction && api.protocol !== 'https:') {
  console.error('[csp] Production VITE_API_URL must use HTTPS.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const globalHeaders = config.headers?.find((entry) => entry.source === '/(.*)')?.headers || [];
const csp = globalHeaders.find((header) => header.key.toLowerCase() === 'content-security-policy')?.value;
if (!csp) {
  console.error('[csp] No global Content-Security-Policy found in frontend/vercel.json.');
  process.exit(1);
}

const directive = (name) => csp.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) || '';
const connect = directive('connect-src').split(/\s+/).slice(1);
const script = directive('script-src').split(/\s+/).slice(1);

if (!connect.includes(apiOrigin)) {
  console.error(`[csp] connect-src does not include the build API origin ${apiOrigin}.`);
  console.error(`[csp] Current connect-src: ${connect.join(' ')}`);
  process.exit(1);
}
if (connect.includes('*')) {
  console.error('[csp] connect-src must not contain a wildcard.');
  process.exit(1);
}
if (!script.includes("'self'")) {
  console.error("[csp] script-src must include 'self'.");
  process.exit(1);
}
if (script.includes("'unsafe-inline'") || script.includes("'unsafe-eval'")) {
  console.error('[csp] script-src must not allow unsafe-inline or unsafe-eval.');
  process.exit(1);
}
if (!csp.includes("object-src 'none'") || !csp.includes("frame-ancestors 'none'")) {
  console.error("[csp] object-src 'none' and frame-ancestors 'none' are required.");
  process.exit(1);
}

console.log(`[csp] OK: connect-src includes ${apiOrigin}; script-src is self-only.`);
