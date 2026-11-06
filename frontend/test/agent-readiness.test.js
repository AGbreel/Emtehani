import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const publicDir = path.join(root, 'public');
const read = (relative) => readFileSync(path.join(publicDir, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));

const SITE = 'https://emtehani.vercel.app';
const API = 'https://emtehani.runasp.net';

test('robots.txt separates search and training crawlers', () => {
  const robots = read('robots.txt');
  for (const agent of ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'GPTBot', 'ClaudeBot', 'Google-Extended']) {
    assert.match(robots, new RegExp(`^User-agent: ${agent}$`, 'm'), `${agent} group is missing`);
  }
  assert.match(robots, /^Content-Signal: search=yes, ai-input=yes, ai-train=no$/m);
  assert.match(robots, /^Sitemap: https:\/\/emtehani\.vercel\.app\/sitemap\.xml$/m);
  assert.doesNotMatch(robots, /^Agentmap:/m, 'non-standard Agentmap directive must not be present');
  assert.match(robots, /^Disallow: \/api\/$/m);
  const defaultGroup = robots.split('# Search crawlers:')[0];
  assert.doesNotMatch(defaultGroup, /^Disallow: \/$/m);
});

test('sitemap only contains public canonical URLs', () => {
  const sitemap = read('sitemap.xml');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.ok(locations.length >= 1);
  assert.ok(locations.every((url) => url.startsWith(`${SITE}/`)));
  assert.ok(!locations.some((url) => /login|dashboard|exam|student|teacher|auth/i.test(url)));
  assert.ok(!sitemap.includes('<lastmod>'));
});

test('API catalog is a valid RFC 9727 linkset', () => {
  const catalog = json('.well-known/api-catalog');
  assert.ok(Array.isArray(catalog.linkset));
  const anchor = catalog.linkset[0];
  assert.equal(anchor.anchor, `${SITE}/`);
  for (const relation of ['service-desc', 'service-doc', 'status']) {
    assert.ok(Array.isArray(anchor[relation]) && anchor[relation].length > 0, `${relation} missing`);
    for (const link of anchor[relation]) {
      assert.match(link.href, /^https:\/\//);
      assert.ok(link.type);
    }
  }
  assert.ok(anchor['service-desc'].some((link) => link.href === `${API}/swagger/v1/swagger.json`));
});

test('ARD catalogs are identical and structurally valid', () => {
  const ai = read('.well-known/ai-catalog.json');
  const ard = read('.well-known/ard.json');
  assert.equal(ard, ai);
  const catalog = JSON.parse(ai);
  assert.equal(catalog.specVersion, '1.0');
  assert.ok(catalog.host.displayName);
  assert.ok(Array.isArray(catalog.entries) && catalog.entries.length >= 4);
  const identifiers = new Set();
  for (const entry of catalog.entries) {
    assert.match(entry.identifier, /^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/);
    assert.ok(!identifiers.has(entry.identifier), 'duplicate ARD identifier');
    identifiers.add(entry.identifier);
    assert.ok(entry.displayName);
    assert.match(entry.type, /^[a-z]+\/[a-zA-Z0-9.+-]+$/);
    assert.equal(Boolean(entry.url) !== Boolean(entry.data), true, 'exactly one of url/data');
    assert.ok(entry.representativeQueries.length >= 2 && entry.representativeQueries.length <= 5);
    if (entry.url) assert.ok(entry.url.startsWith(`${SITE}/`) || entry.url.startsWith(`${API}/`));
  }
});

test('MCP server card matches implemented public tools', () => {
  const card = json('.well-known/mcp/server-card.json');
  assert.equal(card.serverInfo.name, 'emtehani-mcp');
  assert.equal(card.transport.type, 'streamable-http');
  assert.equal(card.transport.endpoint, `${API}/mcp`);
  assert.deepEqual(card.tools.map((tool) => tool.name), [
    'get_platform_info',
    'list_education_catalog',
    'get_service_health',
    'get_discovery_links',
  ]);
  assert.equal(card.authentication.required, false);
  assert.equal(read('.well-known/mcp-server-card.json'), read('.well-known/mcp/server-card.json'));
});

test('Agent Skills index digests match published skill files', () => {
  const index = json('.well-known/agent-skills/index.json');
  assert.equal(index.$schema, 'https://schemas.agentskills.io/discovery/0.2.0/schema.json');
  assert.ok(index.skills.length >= 1);
  for (const skill of index.skills) {
    assert.match(skill.name, /^[a-z0-9][a-z0-9-]{0,63}$/);
    assert.equal(skill.type, 'skill-md');
    assert.ok(skill.url.startsWith(`${SITE}/.well-known/agent-skills/`));
    const relative = skill.url.slice(`${SITE}/`.length);
    assert.ok(existsSync(path.join(publicDir, relative)), `missing ${relative}`);
    const body = read(relative);
    const digest = createHash('sha256').update(body, 'utf8').digest('hex');
    assert.equal(skill.digest, `sha256:${digest}`, `digest mismatch for ${skill.name}`);
    assert.match(body, /^---\nname: /);
  }
});

test('auth.md documents the real auth model and OAuth gap', () => {
  const auth = read('auth.md');
  assert.match(auth, /JWT/);
  assert.match(auth, /Not implemented/i);
  assert.match(auth, /OAuth/i);
  assert.match(auth, /dynamic client registration/i);
  assert.match(auth, /student/i);
});

test('discovery documents do not contain secrets or private records', () => {
  const files = [
    '.well-known/api-catalog',
    '.well-known/ai-catalog.json',
    '.well-known/ard.json',
    '.well-known/mcp/server-card.json',
    '.well-known/agent-skills/index.json',
    'agent.md',
    'llms.txt',
  ];
  for (const file of files) {
    const body = read(file);
    assert.doesNotMatch(body, /eyJhbGciOi/, `${file} contains a JWT`);
    assert.doesNotMatch(body, /postgres(?:ql)?:\/\//i, `${file} contains a database URL`);
    assert.doesNotMatch(body, /@example\.com/i, `${file} contains test data`);
    assert.doesNotMatch(body, /"password"\s*:/i, `${file} contains a password field`);
    assert.doesNotMatch(body, /refreshToken/, `${file} contains a refresh token field`);
  }
});

test('vercel.json applies discovery content types and security headers', () => {
  const config = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const all = config.headers.flatMap((entry) => entry.headers.map((header) => ({ source: entry.source, ...header })));
  const find = (source, key) => all.find((header) => header.source === source && header.key.toLowerCase() === key.toLowerCase());
  assert.equal(find('/robots.txt', 'Content-Type').value, 'text/plain; charset=utf-8');
  assert.equal(find('/.well-known/api-catalog', 'Content-Type').value, 'application/linkset+json; charset=utf-8');
  assert.equal(find('/.well-known/ai-catalog.json', 'Access-Control-Allow-Origin').value, '*');
  assert.equal(find('/.well-known/mcp/server-card.json', 'Access-Control-Allow-Origin').value, '*');
  assert.equal(find('/auth.md', 'Content-Type').value, 'text/markdown; charset=utf-8');
  assert.ok(find('/', 'Link').value.includes('rel="api-catalog"'));
  const csp = find('/(.*)', 'Content-Security-Policy').value;
  assert.ok(csp.includes("default-src 'self'"));
  assert.ok(csp.includes(`connect-src 'self' ${API}`), 'CSP must allow the authoritative MonsterASP API');
  assert.ok(!/connect-src[^;]*\*/.test(csp), 'CSP connect-src must not use a wildcard');
});

test('middleware only converts the public home page', () => {
  const middleware = readFileSync(path.join(root, 'middleware.js'), 'utf8');
  assert.match(middleware, /matcher: '\/'/);
  assert.match(middleware, /text\/markdown/);
  assert.match(middleware, /x-markdown-tokens/);
  assert.doesNotMatch(middleware, /\/api\//);
});

test('API documentation page avoids private data and advertises discovery', () => {
  const docs = read('api-docs/index.html');
  assert.match(docs, /OpenAPI Specification/);
  assert.match(docs, /OAuth 2\.0/);
  assert.match(docs, /api-catalog/);
  assert.doesNotMatch(docs, /@example\.com/i);
});
