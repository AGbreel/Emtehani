/**
 * Vercel Edge Middleware — Markdown for Agents.
 *
 * Public home page only. When a client explicitly asks for Markdown
 * (`Accept: text/markdown`) and does not prefer HTML, return the maintained
 * Markdown representation at /agent.md. Browsers and clients that ask for HTML
 * (or send no Accept header) keep the normal SPA response untouched.
 *
 * JSON APIs are never converted. Private application routes are not matched.
 */

const LINK_HEADER = [
  '<https://emtehani.vercel.app/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"; title="API Catalog"',
  '<https://emtehani.runasp.net/swagger/v1/swagger.json>; rel="service-desc"; type="application/json"; title="OpenAPI Specification"',
  '<https://emtehani.vercel.app/api-docs/>; rel="service-doc"; type="text/html"; title="API Documentation"',
  '<https://emtehani.vercel.app/.well-known/ai-catalog.json>; rel="ai-catalog"; type="application/json"; title="AI Catalog"',
  '<https://emtehani.vercel.app/.well-known/ard.json>; rel="ard"; type="application/json"; title="ARD Manifest"',
  '<https://emtehani.vercel.app/.well-known/mcp/server-card.json>; rel="describedby"; type="application/json"; title="MCP Server Card"',
  '<https://emtehani.vercel.app/.well-known/agent-skills/index.json>; rel="agent-skills"; type="application/json"; title="Agent Skills"',
  '<https://emtehani.vercel.app/auth.md>; rel="related"; type="text/markdown"; title="Authentication Guide"',
  '<https://emtehani.vercel.app/agent.md>; rel="alternate"; type="text/markdown"; title="Markdown Home"',
].join(', ');

function quality(accept, type) {
  // Return the highest q-value for an exact media type, or 0 when absent.
  let best = 0;
  for (const part of accept.split(',')) {
    const [rawType, ...params] = part.trim().split(';');
    if (rawType.trim().toLowerCase() !== type) continue;
    let q = 1;
    for (const param of params) {
      const [key, value] = param.trim().split('=');
      if (key?.toLowerCase() === 'q') {
        const parsed = Number.parseFloat(value);
        q = Number.isFinite(parsed) ? parsed : 0;
      }
    }
    if (q > best) best = q;
  }
  return best;
}

export const config = {
  matcher: '/',
};

export default async function middleware(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return undefined;

  const accept = request.headers.get('accept') || '';
  const markdownQ = quality(accept, 'text/markdown');
  const htmlQ = quality(accept, 'text/html');
  if (markdownQ <= 0 || markdownQ < htmlQ) return undefined;

  const source = new URL('/agent.md', request.url);
  const upstreamHeaders = { accept: 'text/markdown' };
  // Preview deployments can be protected by Vercel Authentication. Forward the
  // bypass header (same origin only) so the Markdown representation resolves
  // during preview verification. Production does not require it.
  const bypass = request.headers.get('x-vercel-protection-bypass');
  if (bypass) upstreamHeaders['x-vercel-protection-bypass'] = bypass;

  const upstream = await fetch(source, { headers: upstreamHeaders });
  if (!upstream.ok) return undefined;

  const upstreamType = (upstream.headers.get('content-type') || '').toLowerCase();
  if (!upstreamType.startsWith('text/markdown') && !upstreamType.startsWith('text/plain')) {
    return undefined;
  }

  const body = await upstream.text();
  // Never wrap a login page, error page, or SPA shell as Markdown.
  if (/^\s*<!doctype\s+html/i.test(body) || /^\s*<html[\s>]/i.test(body)) {
    return undefined;
  }

  const headers = new Headers({
    'Content-Type': 'text/markdown; charset=utf-8',
    'Content-Language': 'ar',
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Vary': 'Accept',
    'x-markdown-tokens': String(Math.max(1, Math.ceil(body.length / 4))),
    'Link': LINK_HEADER,
  });
  return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
}
