---
name: emtehani-public-api
description: Work with the Emtehani REST API correctly. Use when a developer or agent needs the API base URL, authentication flow, rate limits, error format, or public endpoints. Covers JWT bearer authentication and explicitly documents the absence of OAuth/OIDC and agent registration.
---

# Emtehani Public API

Base URL: https://emtehani.runasp.net
OpenAPI: https://emtehani.runasp.net/swagger/v1/swagger.json
Human docs: https://emtehani.vercel.app/api-docs/

## Authentication

Emtehani uses first-party email/password authentication:

1. `POST /api/auth/login` with `{"email":"...","password":"..."}`.
2. Receive a JWT access token (8-hour lifetime) and an opaque refresh token
   (30-day lifetime, rotated on use).
3. Send `Authorization: Bearer <access-token>` on protected requests.
4. Renew with `POST /api/auth/refresh` and `{"refreshToken":"..."}`.

There is **no OAuth 2.0 / OpenID Connect authorization server**, no API-key
scheme, no client-credentials flow, and no dynamic client registration. Do not
invent authorization endpoints or JWKS URLs. Do not collect or replay user
passwords in an automated flow.

## Roles

- `Teacher`: manage own exams, sessions, linked students, essays, results.
- `Student`: enroll with teachers, enter eligible exams, view own results.

Authorization is enforced on the server from the validated JWT. A user id in a
request body or query string is never trusted.

## Public endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Service and database health |
| GET | `/api` | Service name and version |
| POST | `/api/auth/register` | Human account registration |
| POST | `/api/auth/login` | Issue access + refresh tokens |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/logout` | Revoke refresh token |
| GET | `/api/auth/verify-email` | Confirm email with one-time token |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Set a new password with a valid token |

All other endpoints require a bearer token and appropriate role/resource access.

## Limits and errors

- API: 120 requests/minute per client or user.
- Auth: 60 requests/minute per client.
- Code entry: 10 attempts/minute per authenticated user.
- Requests over 2 MB are rejected.
- `429` responses include `Retry-After`.
- Errors use `application/problem+json` with `title`, `status`, and `traceId`.

## Privacy rules

Never request, enumerate, or attempt to infer:

- student or teacher names, emails, stage/grade, or student codes;
- exam questions, correct answers, join codes, or participant lists;
- submissions, answers, scores, feedback, or audit events;
- access tokens, refresh tokens, password hashes, or configuration secrets.

These are available only through authenticated endpoints to the owning user or
teacher. Do not attempt to bypass authentication, CORS, rate limits, or role
checks.

## Discovery resources

- API catalog: https://emtehani.vercel.app/.well-known/api-catalog
- Authentication guide: https://emtehani.vercel.app/auth.md
- AI catalog: https://emtehani.vercel.app/.well-known/ai-catalog.json
- MCP server card: https://emtehani.vercel.app/.well-known/mcp/server-card.json
- Agent Skills index: https://emtehani.vercel.app/.well-known/agent-skills/index.json

## Contact

ahmedgbreel47@gmail.com
