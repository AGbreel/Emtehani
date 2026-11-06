import { EDUCATION_STAGES, GRADES_BY_STAGE } from './education.js';

/**
 * WebMCP progressive enhancement.
 *
 * Only public, read-only platform information is exposed. Nothing here reads
 * localStorage, tokens, exam data, or any authenticated API. Server-side
 * authorization remains the only authority for private data; these tools are
 * not a substitute for it.
 *
 * Browsers without `document.modelContext` are unaffected.
 */

const PUBLIC_ORIGIN = 'https://emtehani.vercel.app';

const tools = [
  {
    name: 'get-platform-overview',
    title: 'Get Emtehani platform overview',
    description:
      'Return a public overview of Emtehani: what the Arabic-first exam platform does, who it serves, the supported roles, and canonical public links.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async () => JSON.stringify({
      name: 'Emtehani',
      nameAr: 'امتحاني',
      description:
        'Arabic-first school exam platform for teachers and students: exam creation, waiting room, live sessions, grading, essay review, and results.',
      url: `${PUBLIC_ORIGIN}/`,
      roles: ['Teacher', 'Student'],
      languages: ['ar'],
      authentication: 'Email/password with JWT access tokens and rotating refresh tokens. No OAuth/OIDC.',
      publicResources: {
        markdownHome: `${PUBLIC_ORIGIN}/agent.md`,
        apiDocs: `${PUBLIC_ORIGIN}/api-docs/`,
        authGuide: `${PUBLIC_ORIGIN}/auth.md`,
        apiCatalog: `${PUBLIC_ORIGIN}/.well-known/api-catalog`,
        aiCatalog: `${PUBLIC_ORIGIN}/.well-known/ai-catalog.json`,
        mcpServerCard: `${PUBLIC_ORIGIN}/.well-known/mcp/server-card.json`,
      },
      privacy:
        'Student, teacher, exam, answer, and result data are private and are never returned by public tools.',
    }, null, 2),
  },
  {
    name: 'list-education-levels',
    title: 'List education stages and grades',
    description:
      'Return the education stages supported by Emtehani and the grades that belong to each stage. This is public catalog data, not student data.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async () => JSON.stringify({
      stages: EDUCATION_STAGES.map((stage) => ({
        stage,
        grades: GRADES_BY_STAGE[stage] || [],
      })),
    }, null, 2),
  },
  {
    name: 'get-authentication-guide',
    title: 'Get authentication guidance',
    description:
      'Explain how authentication actually works on Emtehani, including the JWT bearer model, refresh tokens, role-based access, and the documented absence of OAuth/OIDC and agent registration.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async () => JSON.stringify({
      accessToken: 'JWT bearer token, 8-hour lifetime, HMAC-SHA256',
      refreshToken: 'Opaque 256-bit token, 30-day lifetime, rotated on every use',
      loginEndpoint: 'POST https://emtehani.runasp.net/api/auth/login',
      refreshEndpoint: 'POST https://emtehani.runasp.net/api/auth/refresh',
      roles: ['Teacher', 'Student'],
      authorization:
        'Enforced server-side from the validated JWT. Resource ownership and enrollment are checked on every request.',
      oauth: {
        supported: false,
        openidConfiguration: null,
        authorizationServer: null,
        dynamicClientRegistration: false,
      },
      agentRegistration: false,
      guide: `${PUBLIC_ORIGIN}/auth.md`,
      warning:
        'Never collect or replay user passwords. Private student, teacher, and exam data requires authenticated endpoints and is not available to public tools.',
    }, null, 2),
  },
];

export function installWebMcpTools() {
  if (typeof document === 'undefined') return () => {};
  const modelContext = document.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== 'function') return () => {};

  const controller = new AbortController();
  let disposed = false;

  (async () => {
    for (const tool of tools) {
      if (disposed) return;
      try {
        await modelContext.registerTool(tool, { signal: controller.signal });
      } catch {
        // A browser may reject a tool name or schema while the API is still
        // experimental. Keep the rest of the page working.
      }
    }
  })();

  return () => {
    disposed = true;
    controller.abort();
  };
}
