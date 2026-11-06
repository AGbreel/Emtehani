# DNS-AID records — Emtehani

**Status: not publishable on the current host.**
**Prepared:** 2026-10-30
**Reference:** `draft-mozleywilliams-dnsop-dnsaid-02` (May 2026) and RFC 9460.

## Why nothing was published

- The production host is `emtehani.vercel.app`, a subdomain of `vercel.app`.
  The `vercel.app` DNS zone is owned and operated by Vercel; this project has no
  authority to add `SVCB`/`HTTPS`, `TXT`, or `DS` records there.
- No custom domain is connected to either Vercel project (Vercel reports zero
  domains on the account), so there is no zone under this project's control.
- `emtehani.vercel.app` currently has no `HTTPS` or `SVCB` record. The
  `vercel.app` zone has no `DNSKEY` and no `DS`, so DNSSEC is not available for
  this name either.
- Creating records with invented owner names or pointing at endpoints that do
  not exist would violate DNS-AID and this project's discovery policy.

DNS-AID therefore remains **prepared, not deployed**. The exact records below
are ready to apply once a real custom domain is connected to this project and
its DNS zone (and DNSSEC) is under the owner's control.

## Required records (apply only after connecting a custom domain)

Replace `emtehani.TLD` with the connected domain, for example
`emtehani.com`. The endpoint and capability URL are the real production
resources and do not change.

```zone
; ---------------------------------------------------------------------------
; DNS-AID primary agent record (draft-02 §3.1, RFC 9460 HTTPS ServiceMode)
; The target is the real API host that serves the MCP endpoint.
; ---------------------------------------------------------------------------
mcp.emtehani.TLD.        3600 IN HTTPS 1 emtehani-api.vercel.app. (
    alpn="mcp,h2,h3"
    port=443
    well-known="/.well-known/mcp/server-card.json"
    cap="https://emtehani.vercel.app/.well-known/mcp/server-card.json"
    cap-sha256="d5m24SWYbSjNCQmGDUOhhtRMyL70VhzfcvgqBoHHKgw"
    mandatory=alpn,port
)

; ---------------------------------------------------------------------------
; Optional inventory leaf (draft-02 §3.1). AliasMode points at the primary
; owner above. Do not publish an _index._agents record until a real DNS-AID
; organization index exists; the HTTPS ARD catalog is not a DNS-AID index.
; ---------------------------------------------------------------------------
_agents.emtehani.TLD.    3600 IN SVCB 0 mcp.emtehani.TLD.
```

If the DNS provider does not accept the multi-line zone syntax, use the
single-line form:

```zone
mcp.emtehani.TLD. 3600 IN HTTPS 1 emtehani-api.vercel.app. alpn="mcp,h2,h3" port=443 well-known="/.well-known/mcp/server-card.json" cap="https://emtehani.vercel.app/.well-known/mcp/server-card.json" cap-sha256="d5m24SWYbSjNCQmGDUOhhtRMyL70VhzfcvgqBoHHKgw" mandatory=alpn,port
_agents.emtehani.TLD. 3600 IN SVCB 0 mcp.emtehani.TLD.
```

### Notes on the record values

- **TargetName** is `emtehani-api.vercel.app.` because that host actually serves
  `POST /mcp` and the MCP server card. DNS-AID permits a TargetName that differs
  from the owner name.
- **`alpn`** advertises `mcp` plus the HTTP transports `h2` and `h3`. The draft
  registers `mcp` as an ALPN identifier; the endpoint is HTTPS.
- **`well-known`** is the well-known path on the target that serves the server
  card.
- **`cap`** is the canonical public server card.
- **`cap-sha256`** is the base64url-encoded SHA-256 of the RFC 8785 (JCS)
  canonical form of that card. Current value:
  `d5m24SWYbSjNCQmGDUOhhtRMyL70VhzfcvgqBoHHKgw`.
  Recompute it if the card changes. The raw-file digest is different because
  JCS sorts keys; do not substitute it.
- **`mandatory=alpn,port`** prevents a consumer from silently ignoring the
  transport parameters, per RFC 9460 §8.

## DNSSEC

The zone must be signed before DNS-AID records carry any authenticity value.
For a custom domain:

1. Enable DNSSEC at the DNS provider and publish the resulting `DS` record at
   the registrar.
2. Wait for the chain of trust to validate from the root.
3. Verify with a validating resolver:

```bash
dig +dnssec HTTPS mcp.emtehani.TLD
dig +dnssec DS emtehani.TLD
dig +dnssec DNSKEY emtehani.TLD
```

The `HTTPS` answer must include an RRSIG and the response must have the `AD`
(authenticated data) flag set when queried through a validating resolver.

## DANE / TLSA (optional, not prepared)

DNS-AID recommends TLSA for TLS endpoint authentication (§6.2), but a TLSA
record must be derived from the certificate actually presented by the endpoint
and published in the endpoint's own DNS zone. `emtehani-api.vercel.app` is in
Vercel's zone, so no TLSA record can be published for it. If the API later
moves to a custom domain, generate the TLSA record from the live certificate
and add it at `_443._tcp.<api-host>`.

## Verification after applying

```bash
# SVCB/HTTPS parameters and target
dig +short HTTPS mcp.emtehani.TLD
dig +short SVCB _agents.emtehani.TLD

# DNSSEC chain
dig +dnssec +multi DS emtehani.TLD
dig +dnssec +multi HTTPS mcp.emtehani.TLD

# Capability descriptor integrity
curl -fsS https://emtehani.vercel.app/.well-known/mcp/server-card.json -o /tmp/card.json
# Recompute the JCS digest and compare with cap-sha256 before trusting the card.
```

Until the records above are live and DNSSEC-validated, agents should use the
HTTPS discovery documents instead:

- https://emtehani.vercel.app/.well-known/ai-catalog.json
- https://emtehani.vercel.app/.well-known/ard.json
- https://emtehani.vercel.app/.well-known/mcp/server-card.json
