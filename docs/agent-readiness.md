# Agent Readiness — implementation and verification

**Status:** deployed to production on 2026-10-30.
**Site:** https://emtehani.vercel.app/
**API:** https://emtehani.runasp.net/

This document records what was implemented, what is intentionally not
implemented, and how to re-verify the deployment.

## Published resources

| Resource | URL | Content-Type |
| --- | --- | --- |
| robots.txt | https://emtehani.vercel.app/robots.txt | `text/plain; charset=utf-8` |
| sitemap.xml | https://emtehani.vercel.app/sitemap.xml | `application/xml; charset=utf-8` |
| API catalog (RFC 9727) | https://emtehani.vercel.app/.well-known/api-catalog | `application/linkset+json` |
| OpenAPI specification | https://emtehani.runasp.net/swagger/v1/swagger.json | `application/json` |
| AI catalog / ARD | https://emtehani.vercel.app/.well-known/ai-catalog.json | `application/json` |
| ARD alias | https://emtehani.vercel.app/.well-known/ard.json | `application/json` |
| MCP server card | https://emtehani.vercel.app/.well-known/mcp/server-card.json | `application/json` |
| MCP legacy card alias | https://emtehani.vercel.app/.well-known/mcp-server-card.json | `application/json` |
| MCP endpoint | https://emtehani.runasp.net/mcp | `application/json` |
| Agent Skills index | https://emtehani.vercel.app/.well-known/agent-skills/index.json | `application/json` |
| Agent Skills | https://emtehani.vercel.app/.well-known/agent-skills/*/SKILL.md | `text/markdown` |
| Authentication guide | https://emtehani.vercel.app/auth.md | `text/markdown` |
| Markdown home | https://emtehani.vercel.app/agent.md | `text/markdown` |
| llms.txt | https://emtehani.vercel.app/llms.txt | `text/plain` |
| Public API docs | https://emtehani.vercel.app/api-docs/ | `text/html` |

## Design decisions

- **Search vs training crawlers.** Search crawlers (including OAI-SearchBot,
  Claude-SearchBot, and PerplexityBot) may crawl public pages. Training-only
  crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot) are blocked, and the
  Content Signals line declares `search=yes, ai-input=yes, ai-train=no`.
- **Private surfaces.** Dashboards, student/teacher records, exams, answers,
  results, and authenticated API routes are excluded from robots.txt, the
  sitemap, every discovery document, and every public agent tool. The SPA has no
  public URL for those states.
- **Markdown for Agents.** A Vercel Edge Middleware (`frontend/middleware.js`)
  serves `/agent.md` for `Accept: text/markdown` on `/` only, with
  `Content-Type: text/markdown`, `Vary: Accept`, and `x-markdown-tokens`. HTML is
  unchanged when HTML or `*/*` is requested. The middleware validates that the
  upstream response is actually Markdown and never wraps an HTML error page.
- **OpenAPI.** Swashbuckle's JSON document is served publicly; the interactive
  Swagger UI remains development-only. The API catalog, ARD manifests, Link
  headers, and docs all point at the real document.
- **MCP.** A small public MCP server (`POST /mcp`) exposes four read-only tools:
  `get_platform_info`, `list_education_catalog`, `get_service_health`, and
  `get_discovery_links`. It uses no authentication because it exposes no private
  data. The server card and the implemented tool list match.
- **Agent Skills.** Two real skills are published with SHA-256 digests in the
  Agent Skills 0.2.0 `digest` field (value prefixed `sha256:`). The index uses
  the official `$schema` and absolute skill URLs.
- **WebMCP.** `frontend/src/lib/webmcp.js` registers three read-only public tools
  through `document.modelContext.registerTool()` only when the API exists. Each
  tool has a name, description, JSON `inputSchema`, `execute`, and an
  `AbortSignal`-based cleanup. Nothing reads tokens or private data. The
  login/registration forms are deliberately **not** exposed declaratively because
  they handle credentials and account creation; there is no other suitable
  public form on the Emtehani app.
- **CSP and headers.** The production site sends a restrictive CSP,
  HSTS, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, a minimal
  Permissions-Policy, COOP, and `X-Permitted-Cross-Domain-Policies: none`.
  `connect-src` is limited to the real API origin; `img-src` allows only the
  portfolio's actual image hosts.

## Intentionally not implemented

### OAuth 2.0 / OpenID Connect

The application uses email/password authentication with an 8-hour HMAC-SHA256
JWT and a rotating 30-day refresh token. There is no authorization server, no
JWKS, no scopes, and no dynamic client registration. Therefore:

- `/.well-known/openid-configuration` returns 404.
- `/.well-known/oauth-authorization-server` returns 404.
- `/.well-known/oauth-protected-resource` returns 404.

The required migration is documented in `frontend/public/auth.md` §7. Publishing
metadata now would be false advertising and could mislead agents into attempting
a flow that does not exist.

### DNS-AID

`emtehani.vercel.app` is a subdomain of Vercel's `vercel.app` zone. This project
does not control that zone, and no custom domain is connected to either Vercel
project. The `vercel.app` zone has no `DNSKEY`/`DS` (DNSSEC is not enabled), and
there are no `HTTPS`/`SVCB` records for the site or API.

The exact records to apply after connecting a custom domain (including
`alpn`, `port`, `well-known`, `cap`, `cap-sha256`, and `mandatory`) are in
`docs/dns-aid-records.md`. They deliberately were not published as fake or
unreachable DNS records.

### Backend preview environment

The backend preview deployment was created but cannot run because Production
environment variables (database, JWT key, origins) are scoped to Production.
This is intentional secret isolation, not a code failure. The backend was
verified locally against an isolated PostgreSQL instance and then deployed to
Production, where its environment is configured.

## Re-verification

```bash
cd frontend
npm run test:unit
npm run build
npm run test:agent-readiness
```

`npm run test:agent-readiness` performs 166 external checks against the live
domain: status codes, content types, CORS, Link headers, Markdown negotiation,
sitemap/robots rules, ARD structure and links, Agent Skills digests, OpenAPI,
MCP initialization/tool calls, OAuth metadata absence, and the anonymous-access
rejection on a private API route.

Backend:

```bash
cd backend
dotnet test Emtehani.slnx -c Release
```

Playwright (requires an isolated PostgreSQL instance; see
`frontend/playwright.config.js`):

```bash
cd frontend
npm run test:e2e
```

## Verification results (2026-10-30)

- `npm run build`: passed.
- `npm run test:unit`: 19/19 passed.
- `dotnet test` (Release, SQLite suite): 51 passed, 4 PostgreSQL tests skipped.
- `dotnet test` with `EMTEHANI_RUN_POSTGRES_TESTS=1` against isolated PostgreSQL:
  55/55 passed.
- Playwright: 19 passed, 15 intentionally skipped, 0 failed.
- Live Agent Readiness verification: 166 passed, 0 failed.
- Production UI checks (CSP, login form, portfolio images, WebMCP mock, mobile
  390 px): 15/15 passed.
- API CORS: allowed origin receives `Access-Control-Allow-Origin:
  https://emtehani.vercel.app`; disallowed origin receives none.
- API health and database: `200 Healthy`.
