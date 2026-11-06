# Authentication & Access — Emtehani

**Canonical URL:** https://emtehani.vercel.app/auth.md
**Last reviewed:** 2026-10-30
**Applies to:** https://emtehani.vercel.app/ and https://emtehani.runasp.net/

This document describes how authentication and authorization actually work in
Emtehani today. It intentionally does not advertise OAuth, OpenID Connect, or
dynamic client registration, because those capabilities are **not implemented**.

---

## 1. Supported authentication methods

| Method | Status | Used by |
| --- | --- | --- |
| Email + password | Supported | Teachers and students |
| JWT bearer access token | Supported | The web app and any client that obtains a token |
| Rotating refresh token | Supported | The web app (30-day session renewal) |
| OAuth 2.0 / OpenID Connect | **Not implemented** | — |
| API keys | **Not implemented** | — |
| Mutual TLS / DPoP | **Not implemented** | — |
| Agent registration / DCR | **Not implemented** | — |

### Token details

- Access tokens are signed JWTs (HMAC-SHA256) with an 8-hour lifetime.
- Issuer: `Emtehani`; audience: `Emtehani.Client`.
- Claims include the user id (`nameid`), name, email, and role
  (`Teacher` or `Student`).
- Refresh tokens are random 256-bit values. Only their SHA-256 hash is stored.
  They expire after 30 days and rotate on every use.
- Tokens are sent as `Authorization: Bearer <access-token>`.
- Logout revokes the stored refresh token; access tokens remain valid until
  expiry.

There are no OAuth scopes. Authorization is role- and resource-based and is
enforced by the API on every request.

## 2. How users register

1. Open https://emtehani.vercel.app/ and choose **إنشاء حساب** (register).
2. Choose a role:
   - **Student** must select a valid stage and grade.
   - **Teacher** does not select a stage or grade.
3. Submit full name, email, and a password of 8–128 characters.
4. Confirm the email address using the link sent by the platform.
5. Sign in. Students receive a permanent six-digit student code.

Accounts are created for humans through the public registration form. There is
no programmatic account-provisioning API and no way for an autonomous agent to
register a user.

## 3. How applications obtain access

Today, an application can only act on behalf of a user who signs in explicitly:

1. `POST /api/auth/login` with `{ "email": "...", "password": "..." }`.
2. Receive `{ token, refreshToken, expiresAtUtc, role, ... }`.
3. Send `Authorization: Bearer <token>` on subsequent API calls.
4. Renew with `POST /api/auth/refresh` using `{ "refreshToken": "..." }`.

There is **no client-credentials flow**, no service account, and no
machine-to-machine authorization server. A third-party integration must not ask
users for their password; there is currently no delegated-authorization
mechanism that would make such an integration safe. Contact the maintainer if
you need an integration and are prepared to fund a proper OAuth 2.0/OIDC
authorization server.

## 4. Roles and permissions

| Capability | Teacher | Student |
| --- | --- | --- |
| Register / sign in | Yes | Yes |
| Create and manage own exams | Yes | No |
| Publish exams and open/pause/resume/close sessions | Own exams only | No |
| View participant names, emails, codes, scores | Own exams only | No |
| Review essays and publish results | Own exams only | No |
| Export participant CSV | Own exams only | No |
| List linked students / suspend / ban per exam | Own linked students only | No |
| Browse teachers and request enrollment | No | Yes |
| Enter and submit an exam | No | Linked, eligible exams only |
| View own submissions and released results | No | Own records only |

Teachers can only access exams they created. Students only see exams from
teachers with an accepted enrollment that match the student's stage and grade
and are not banned, suspended, or unlinked. All checks are performed server-side;
hiding a control in the UI is never treated as authorization.

## 5. Access limits for student and teacher data

The following data is private and is never returned by a public discovery
resource, sitemap, Markdown representation, or unauthenticated endpoint:

- Student and teacher names, emails, stage/grade, and student codes.
- Exam questions, correct answers, join codes, and participant lists.
- Submissions, answers, scores, feedback, and audit events.
- Authentication tokens, password hashes, refresh-token hashes, and SMTP or
  database credentials.

Public endpoints return only platform metadata, the education catalog, health
status, and static documentation. Authenticated endpoints always derive the
actor from the validated JWT; they never trust a user id supplied in a request
body or query string.

## 6. Requesting access, registration, or agent permissions

- **Human accounts:** self-service registration at https://emtehani.vercel.app/.
- **Teachers:** registration is open; students request enrollment from the
  teacher's page and the teacher accepts or rejects the request.
- **Agent / application access:** not supported. There is no agent registration,
  no dynamic client registration, and no way to grant an agent scoped access.
  Do not attempt to automate login with stored user passwords.
- **Security or integration requests:** email ahmedgbreel47@gmail.com and
  describe the use case, requested data, and retention requirements.

## 7. OAuth / OIDC gap and what would be required

Emtehani uses first-party email/password authentication with a symmetric-key JWT.
It is **not** an OAuth 2.0 or OpenID Connect deployment:

- No authorization endpoint, token endpoint, or JWKS is published.
- No `/.well-known/openid-configuration` or
  `/.well-known/oauth-authorization-server` is served.
- No `/.well-known/oauth-protected-resource` is served, because no real
  authorization server can issue access tokens for the API.
- No consent screen, scopes, client registry, PKCE flow, or dynamic client
  registration exists.

Adding real OAuth/OIDC without breaking the current login would require:

1. An authorization server (or a hardened OIDC provider) with its own signing
   keys and a published JWKS.
2. A client registry and consent flow, including PKCE for public clients.
3. An access-token validation path in the API that accepts tokens from that
   issuer (in addition to, or instead of, the current symmetric JWT).
4. Scope definitions mapped to existing role/resource checks, without weakening
   them.
5. Protected-resource metadata only after items 1–4 are live and tested.

Until then, publishing OAuth metadata would be misleading and is deliberately
avoided.

## 8. Security notes for agents

- Never request, store, or replay a user's password.
- Never attempt to bypass JWT validation, CORS, rate limits, or role checks.
- Never enumerate student, teacher, exam, or result identifiers.
- Public tools exposed by this site (including WebMCP and the public MCP server)
  are read-only and return only public platform information.
- Access tokens and refresh tokens must be treated as secrets. They are never
  included in discovery documents.

## 9. Related resources

- [API documentation](https://emtehani.vercel.app/api-docs/)
- [API catalog](https://emtehani.vercel.app/.well-known/api-catalog)
- [OpenAPI specification](https://emtehani.runasp.net/swagger/v1/swagger.json)
- [AI catalog](https://emtehani.vercel.app/.well-known/ai-catalog.json)
- [MCP server card](https://emtehani.vercel.app/.well-known/mcp/server-card.json)
- [Agent Skills](https://emtehani.vercel.app/.well-known/agent-skills/index.json)
