# Rule: TikLivePro Documentation Maintenance

This rule mandates that all code changes affecting architecture, infrastructure, services, events, or APIs must be accompanied by a documentation update **in the same change**. Documentation is never deferred.

> **This rule applies to every AI agent and every contributor.**

---

## 1. Change → Doc Routing Table

Use this table to determine which files to update for a given change:

| Change type | Files to update |
|-------------|----------------|
| New service or port change | `docs/architecture.md` (Service Catalogue, Deployment Architecture) · `docs/setup.md` (ports table, step 5) · `.agents/rules/architecture.md` (Service Catalogue) |
| New or changed NATS stream | `docs/events.md` (Stream Catalogue) · `infra/nats/jetstream-config.yaml` · `infra/nats/setup-streams.sh` |
| New or changed NATS consumer | `docs/events.md` (Consumer Catalogue) · `infra/nats/jetstream-config.yaml` · `infra/nats/setup-streams.sh` |
| New or changed event schema | `docs/events.md` (Event Reference) · `packages/events/src/subjects.ts` |
| New Dockerfile or Dockerfile change | `docs/infra.md` (Docker section) · `.agents/rules/infrastructure.md` |
| `docker-compose.dev.yml` change | `docs/infra.md` (Local Development Compose) · `docs/setup.md` (step 2 table) |
| `docker-compose.prod.yml` change | `docs/infra.md` (Production Compose) · `docs/setup.md` (step 12) |
| `infra/docker/build.sh` change | `docs/infra.md` (Build script section) · `docs/setup.md` (step 11) |
| New Kubernetes manifest | `docs/infra.md` (Kubernetes section, apply order) |
| Kubernetes manifest change (ports, replicas, resources) | `docs/infra.md` (relevant section) |
| New Prometheus scrape job | `docs/observability.md` (Prometheus → Scrape jobs) |
| New alert rule | `docs/observability.md` (Alert Rules table) |
| OTel pipeline or exporter change | `docs/observability.md` (OTel Collector section) |
| New Grafana datasource | `docs/observability.md` (Grafana section) |
| New Makefile target | `docs/setup.md` (relevant numbered section) |
| New environment variable | `docs/setup.md` (env vars table) · service `.env.example` |
| Security model change | `docs/architecture.md` (Security Model) · `CLAUDE.md` (Security Notes) |
| New platform support (TikTok, FB, etc.) | `docs/architecture.md` (Supported Platforms table) · `docs/events.md` |
| Architectural decision | `docs/decisions/NNN-title.md` (new ADR) |
| New agent rule file | This file (list in section 3 below) |

---

## 2. Update Procedure

Follow these steps every time you update documentation:

1. **Edit the existing file** — never create a duplicate of an existing doc.
2. **Update the `> Last updated:` date** at the top of the file (format: `YYYY-MM-DD`).
3. **Keep all tables complete** — if you add a service, add a row to every table that lists services across all affected docs.
4. **Keep code examples accurate** — if you rename a Make target, file path, or env var, update every reference in the docs.
5. **Do not delete sections** — append or edit; only remove content when the feature itself is fully removed.
6. **Check cross-references** — if doc A links to doc B, ensure the link target still exists after your change.

---

## 3. Rules File Index

All agent rules live in `.agents/rules/`. This is the complete list:

| File | Governs |
|------|---------|
| `architecture.md` | Clean Architecture boundaries, NATS streams, service catalogue, platform extensibility |
| `api-specs.md` | Fastify schema requirements, JWT security, API Gateway sync, health endpoints |
| `coding-standards.md` | Type safety, env validation, error handling, logging, NATS idempotency, security |
| `frontend.md` | Feature-first structure, responsive design, i18n, Zustand, API communication, auth |
| `infrastructure.md` | Docker builds, Kubernetes manifests, NATS config, observability configuration |
| `documentation.md` | ← This file — documentation maintenance rules |

When adding a new rule file, add a row to this table.

---

## 4. Documentation File Index

All documentation lives in `docs/`. This is the complete list:

| File | Purpose |
|------|---------|
| `docs/architecture.md` | System overview, service catalogue, data flows, security model, deployment architecture |
| `docs/events.md` | NATS stream catalogue, consumer catalogue, event envelope, full event reference |
| `docs/setup.md` | Step-by-step local and production setup guide, all Make targets, troubleshooting |
| `docs/infra.md` | Docker image builds, compose files, Kubernetes manifests, secrets management |
| `docs/observability.md` | OTel Collector, Prometheus, Grafana, Jaeger, alert rules, new service checklist |
| `docs/decisions/` | Architecture Decision Records (ADRs) — numbered, immutable once accepted |
| `docs/oauth-redirect-uri-fix.md` | Troubleshooting: NextAuth OAuth redirect_uri_mismatch |

---

## 5. ADR Format

Architecture Decision Records live in `docs/decisions/NNN-title.md` (zero-padded 3-digit number):

```markdown
# NNN. Short decision title

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded by [NNN](./NNN-title.md)

## Context

What problem or situation required a decision?
Include relevant constraints, prior art, and stakeholder requirements.

## Decision

What was decided? Be specific and unambiguous.

## Consequences

What are the trade-offs, risks, known limitations, or follow-up actions?
```

Existing ADRs:
- `001-nats-jetstream.md` — why NATS JetStream was chosen as the event bus
- `002-comment-polling.md` — why polling was chosen over webhooks for comment aggregation
