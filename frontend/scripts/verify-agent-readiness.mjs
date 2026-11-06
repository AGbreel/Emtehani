#!/usr/bin/env node
/**
 * Agent Readiness verification.
 *
 * Usage:
 *   node scripts/verify-agent-readiness.mjs
 *   node scripts/verify-agent-readiness.mjs --base https://preview.example --api https://api.example
 *   node scripts/verify-agent-readiness.mjs --base http://127.0.0.1:4173 --api http://127.0.0.1:5055
 *
 * Exit code 0 only when every required check passes.
 */

import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const BASE = (argValue('--base', process.env.AGENT_READINESS_BASE || 'https://emtehani.vercel.app')).replace(/\/+$/, '');
const API = (argValue('--api', process.env.AGENT_READINESS_API || 'https://emtehani-api.vercel.app')).replace(/\/+$/, '');
const TIMEOUT_MS = Number(argValue('--timeout', '30000'));

const failures = [];
const passes = [];

function pass(label, detail = '') {
  passes.push(detail ? `${label} — ${detail}` : label);
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
}
function fail(label, detail = '') {
  failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function get(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { redirect: 'follow', ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function read(url, options = {}) {
  const response = await get(url, options);
  return { response, body: await response.text() };
}

function expect(condition, label, detail = '') {
  if (condition) pass(label, detail);
  else fail(label, detail);
  return Boolean(condition);
}

function contentType(response) {
  return (response.headers.get('content-type') || '').toLowerCase();
}

async function expectResource(path, expectedTypes, label) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const { response, body } = await read(url);
  const type = contentType(response);
  const typeOk = expectedTypes.some((expected) => type.startsWith(expected));
  expect(response.status === 200, `${label} returns 200`, `status ${response.status}`);
  expect(typeOk, `${label} content type`, type || '(missing)');
  return { response, body, type };
}

function scanForSecrets(label, text, { includeFields = true } = {}) {
  const patterns = [
    [/eyJhbGciOi/, 'JWT-looking token'],
    [/postgres(?:ql)?:\/\//i, 'PostgreSQL connection string'],
    [/sk-[A-Za-z0-9]{16,}/, 'API key-looking value'],
  ];
  if (includeFields) {
    patterns.push([/"password"\s*:/i, 'password field']);
    patterns.push([/"refreshToken"\s*:/i, 'refresh token field']);
  }
  const found = patterns.filter(([pattern]) => pattern.test(text)).map(([, name]) => name);
  expect(found.length === 0, `${label} contains no secret material`, found.join(', '));
}

async function verifyRobots() {
  console.log('\nrobots.txt');
  const { body } = await expectResource('/robots.txt', ['text/plain'], 'robots.txt');
  for (const ua of ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'GPTBot', 'ClaudeBot', 'Google-Extended']) {
    expect(body.includes(`User-agent: ${ua}`), `robots.txt names ${ua}`);
  }
  expect(body.includes('Content-Signal: search=yes, ai-input=yes, ai-train=no'), 'robots.txt content signals');
  expect(body.includes('Sitemap: https://emtehani.vercel.app/sitemap.xml') || body.includes('Sitemap:'), 'robots.txt links sitemap');
  expect(body.includes('Agentmap:'), 'robots.txt links ARD Agentmap');
  expect(/Disallow:\s*\/api\//.test(body), 'robots.txt disallows /api/');
  expect(/Disallow:\s*\/dashboard\//.test(body), 'robots.txt disallows dashboard');
  const defaultGroup = body.split('# Search crawlers:')[0];
  expect(!/^Disallow:\s*\/\s*$/m.test(defaultGroup), 'robots.txt does not block the whole public site');
}

async function verifySitemap() {
  console.log('\nsitemap.xml');
  const { body } = await expectResource('/sitemap.xml', ['application/xml', 'text/xml'], 'sitemap.xml');
  const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
  expect(body.startsWith('<?xml'), 'sitemap.xml is XML');
  expect(locations.length > 0, 'sitemap.xml has URLs', `${locations.length}`);
  expect(locations.every((url) => url.startsWith(BASE)), 'sitemap URLs use the canonical origin');
  expect(!locations.some((url) => /login|dashboard|exam|student|teacher|auth/i.test(url)), 'sitemap excludes private pages');
  expect(!body.includes('<lastmod>'), 'sitemap omits unverified lastmod');
}

async function verifyDiscoveryDocuments() {
  console.log('\nDiscovery documents');

  const catalog = await expectResource('/.well-known/api-catalog', ['application/linkset+json'], 'api-catalog');
  try {
    const json = JSON.parse(catalog.body);
    expect(Array.isArray(json.linkset) && json.linkset.length > 0, 'api-catalog has linkset');
    const first = json.linkset[0];
    expect(typeof first.anchor === 'string' && first.anchor.startsWith('https://'), 'api-catalog anchor');
    expect(Array.isArray(first['service-desc']) && first['service-desc'].length > 0, 'api-catalog service-desc');
    expect(Array.isArray(first['service-doc']) && first['service-doc'].length > 0, 'api-catalog service-doc');
    expect(Array.isArray(first.status) && first.status.length > 0, 'api-catalog status');
    const hrefs = [];
    for (const entry of json.linkset) {
      for (const rel of ['service-desc', 'service-doc', 'status']) {
        for (const link of entry[rel] || []) if (link.href) hrefs.push(link.href);
      }
    }
    for (const href of [...new Set(hrefs)]) {
      const { response } = await read(href);
      expect(response.status === 200, `catalog link resolves: ${href}`, `status ${response.status}`);
    }
  } catch (error) {
    fail('api-catalog is valid JSON', error.message);
  }

  const ai = await expectResource('/.well-known/ai-catalog.json', ['application/json'], 'ai-catalog');
  let aiJson = null;
  try {
    aiJson = JSON.parse(ai.body);
    expect(aiJson.specVersion === '1.0', 'ai-catalog specVersion');
    expect(aiJson.host && typeof aiJson.host.displayName === 'string', 'ai-catalog host');
    expect(Array.isArray(aiJson.entries) && aiJson.entries.length > 0, 'ai-catalog entries', `${aiJson.entries?.length || 0}`);
    for (const entry of aiJson.entries || []) {
      const urnOk = /^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/.test(entry.identifier || '');
      expect(urnOk, `ARD URN format: ${entry.identifier}`);
      expect(typeof entry.displayName === 'string' && entry.displayName.length > 0, `ARD displayName: ${entry.identifier}`);
      expect(typeof entry.type === 'string' && entry.type.includes('/'), `ARD IANA type: ${entry.identifier}`, entry.type);
      expect(Boolean(entry.url) !== Boolean(entry.data), `ARD exactly one of url/data: ${entry.identifier}`);
      expect(Array.isArray(entry.representativeQueries) && entry.representativeQueries.length >= 2 && entry.representativeQueries.length <= 5,
        `ARD 2-5 representativeQueries: ${entry.identifier}`, `${entry.representativeQueries?.length ?? 0}`);
      if (entry.url) {
        const { response } = await read(entry.url);
        expect(response.status === 200, `ARD url resolves: ${entry.url}`, `status ${response.status}`);
      }
    }
  } catch (error) {
    fail('ai-catalog is valid JSON', error.message);
  }
  expect(ai.response.headers.get('access-control-allow-origin') === '*', 'ai-catalog CORS');
  scanForSecrets('ai-catalog', ai.body);

  const ard = await expectResource('/.well-known/ard.json', ['application/json'], 'ard.json');
  expect(ard.body === ai.body, 'ard.json matches ai-catalog.json');
  expect(ard.response.headers.get('access-control-allow-origin') === '*', 'ard.json CORS');

  const card = await expectResource('/.well-known/mcp/server-card.json', ['application/json'], 'MCP server card');
  let cardJson = null;
  try {
    cardJson = JSON.parse(card.body);
    expect(cardJson.serverInfo?.name === 'emtehani-mcp', 'MCP serverInfo name');
    expect(typeof cardJson.version === 'string', 'MCP card version');
    expect(Array.isArray(cardJson.tools) && cardJson.tools.length > 0, 'MCP card tools', `${cardJson.tools?.length || 0}`);
    const endpoint = cardJson.transport?.endpoint || cardJson.remotes?.[0]?.url;
    expect(typeof endpoint === 'string' && endpoint.endsWith('/mcp'), 'MCP transport endpoint', endpoint);
  } catch (error) {
    fail('MCP server card is valid JSON', error.message);
  }
  expect(card.response.headers.get('access-control-allow-origin') === '*', 'MCP card CORS');
  scanForSecrets('MCP server card', card.body);

  const legacyCard = await expectResource('/.well-known/mcp-server-card.json', ['application/json'], 'MCP server card legacy alias');
  expect(legacyCard.body === card.body, 'MCP legacy alias matches canonical card');
  scanForSecrets('MCP server card legacy alias', legacyCard.body);

  const skills = await expectResource('/.well-known/agent-skills/index.json', ['application/json'], 'Agent Skills index');
  try {
    const json = JSON.parse(skills.body);
    expect(json.$schema === 'https://schemas.agentskills.io/discovery/0.2.0/schema.json', 'Agent Skills $schema');
    expect(Array.isArray(json.skills) && json.skills.length > 0, 'Agent Skills entries', `${json.skills?.length || 0}`);
    for (const skill of json.skills || []) {
      expect(/^[a-z0-9][a-z0-9-]{0,63}$/.test(skill.name || ''), `skill name: ${skill.name}`);
      expect(skill.type === 'skill-md' || skill.type === 'archive', `skill type: ${skill.name}`, skill.type);
      expect(typeof skill.description === 'string' && skill.description.length <= 1024, `skill description: ${skill.name}`);
      const { response, body } = await read(skill.url);
      expect(response.status === 200, `skill URL resolves: ${skill.name}`, `status ${response.status}`);
      const digest = createHash('sha256').update(body, 'utf8').digest('hex');
      expect(skill.digest === `sha256:${digest}`, `skill digest: ${skill.name}`, skill.digest);
      expect(contentType(response).startsWith('text/markdown') || contentType(response).startsWith('text/plain'),
        `skill content type: ${skill.name}`, contentType(response));
    }
  } catch (error) {
    fail('Agent Skills index is valid JSON', error.message);
  }
  scanForSecrets('Agent Skills index', skills.body);

  const auth = await expectResource('/auth.md', ['text/markdown'], 'auth.md');
  expect(auth.body.includes('OAuth') && auth.body.includes('Not implemented'), 'auth.md documents OAuth gap');
  expect(auth.body.includes('JWT'), 'auth.md documents JWT');
  scanForSecrets('auth.md', auth.body, { includeFields: false });

  const agent = await expectResource('/agent.md', ['text/markdown'], 'agent.md');
  expect(agent.body.startsWith('#'), 'agent.md is Markdown');
  scanForSecrets('agent.md', agent.body);

  await expectResource('/llms.txt', ['text/plain'], 'llms.txt');
  await expectResource('/api-docs/', ['text/html'], 'api-docs');

  // OAuth metadata must not be published without a real authorization server.
  for (const path of ['/.well-known/openid-configuration', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource']) {
    const response = await get(`${BASE}${path}`);
    expect(response.status === 404, `absent OAuth metadata: ${path}`, `status ${response.status}`);
  }

  return cardJson;
}

async function verifyLinkHeaders() {
  console.log('\nLink headers and content negotiation');
  const { response, body } = await read(`${BASE}/`, { headers: { accept: 'text/html,application/xhtml+xml' } });
  expect(response.status === 200, 'HTML home returns 200');
  expect(contentType(response).startsWith('text/html'), 'HTML home content type', contentType(response));
  expect(body.includes('<div id="root">'), 'HTML home contains the SPA root');

  const link = response.headers.get('link') || '';
  for (const rel of ['api-catalog', 'service-desc', 'service-doc', 'ai-catalog', 'mcp', 'agent-skills']) {
    expect(link.includes(`rel="${rel}"`) || (rel === 'mcp' && link.includes('server-card')), `Link header advertises ${rel}`);
  }
  const hrefs = [...link.matchAll(/<([^>]+)>/g)].map((match) => match[1]);
  for (const href of [...new Set(hrefs)]) {
    const { response: target } = await read(href);
    expect(target.status === 200, `Link target resolves: ${href}`, `status ${target.status}`);
  }

  const markdown = await read(`${BASE}/`, { headers: { accept: 'text/markdown' } });
  expect(markdown.response.status === 200, 'Markdown negotiation returns 200');
  expect(contentType(markdown.response).startsWith('text/markdown'), 'Markdown negotiation content type', contentType(markdown.response));
  expect(markdown.body.startsWith('#'), 'Markdown negotiation returns Markdown');
  const tokens = markdown.response.headers.get('x-markdown-tokens');
  expect(Boolean(tokens) && Number.parseInt(tokens, 10) > 0, 'x-markdown-tokens present', tokens || '(missing)');
  expect((markdown.response.headers.get('vary') || '').toLowerCase().includes('accept'), 'Markdown response varies on Accept');
}

async function verifyApi(skip) {
  console.log('\nAPI and MCP');
  if (skip) {
    console.log('  SKIP  API checks disabled');
    return;
  }
  const health = await read(`${API}/health`);
  expect(health.response.status === 200, 'API health returns 200', `status ${health.response.status}`);
  expect(health.body.trim() === 'Healthy', 'API health is Healthy', health.body.trim());

  const openapi = await read(`${API}/swagger/v1/swagger.json`);
  expect(openapi.response.status === 200, 'OpenAPI JSON returns 200');
  expect(contentType(openapi.response).startsWith('application/json'), 'OpenAPI content type', contentType(openapi.response));
  try {
    const spec = JSON.parse(openapi.body);
    expect(typeof spec.openapi === 'string' && spec.openapi.startsWith('3.'), 'OpenAPI version', spec.openapi);
    expect(spec.paths && Object.keys(spec.paths).length > 10, 'OpenAPI paths present', `${Object.keys(spec.paths || {}).length}`);
    expect(JSON.stringify(spec).includes('/api/auth/login'), 'OpenAPI documents login');
    scanForSecrets('OpenAPI', openapi.body, { includeFields: false });
  } catch (error) {
    fail('OpenAPI is valid JSON', error.message);
  }

  const card = await read(`${API}/.well-known/mcp/server-card.json`);
  expect(card.response.status === 200, 'API MCP server card returns 200');
  expect(card.response.headers.get('access-control-allow-origin') === '*', 'API MCP card CORS');

  const initialize = await fetch(`${API}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'verify', version: '1.0' } } }),
  });
  expect(initialize.status === 200, 'MCP initialize returns 200');
  let init = null;
  try {
    init = await initialize.json();
    expect(init.result?.serverInfo?.name === 'emtehani-mcp', 'MCP initialize serverInfo');
    expect(init.result?.capabilities?.tools, 'MCP initialize capabilities.tools');
    expect(init.result?.protocolVersion === '2025-06-18', 'MCP initialize protocol version', init.result?.protocolVersion);
  } catch (error) {
    fail('MCP initialize is valid JSON-RPC', error.message);
  }

  const list = await fetch(`${API}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  });
  const listJson = await list.json().catch(() => null);
  const names = (listJson?.result?.tools || []).map((tool) => tool.name);
  expect(names.length === 4, 'MCP tools/list returns 4 tools', names.join(', '));

  const call = await fetch(`${API}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_platform_info', arguments: {} } }),
  });
  const callJson = await call.json().catch(() => null);
  expect(callJson?.result?.isError === false, 'MCP get_platform_info succeeds');
  const text = callJson?.result?.content?.[0]?.text || '';
  expect(text.includes('Emtehani'), 'MCP get_platform_info returns platform data');
  expect(!/eyJhbGciOi|postgres(ql)?:\/\//i.test(text), 'MCP tool output contains no secrets');

  const unauthorized = await read(`${API}/api/auth/me`);
  expect(unauthorized.response.status === 401, 'private API rejects anonymous requests', `status ${unauthorized.response.status}`);
}

async function main() {
  console.log(`Agent Readiness verification`);
  console.log(`  Site: ${BASE}`);
  console.log(`  API:  ${API}`);
  await verifyRobots();
  await verifySitemap();
  await verifyDiscoveryDocuments();
  await verifyLinkHeaders();
  await verifyApi(args.includes('--skip-api'));

  console.log(`\nResult: ${passes.length} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('\nVerification crashed:', error);
  process.exitCode = 1;
});
