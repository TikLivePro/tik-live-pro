# Rule: TikLivePro Architecture Guidelines

This rule enforces monorepo structure, Clean Architecture boundaries per microservice, event-driven communication via NATS JetStream, and social platform extensibility interfaces.

## 1. Clean Architecture Boundaries

Every backend microservice inside `/services/` must isolate code into these four inward-pointing layers:

```
src/
├── domain/           # Entities, Value Objects, Repository Interfaces, Domain Events
├── application/      # Use Cases, DTOs, Application Services, Ports
├── infrastructure/   # DB Adapters, HTTP/NATS clients, Repository Concrete Impls
└── interfaces/       # HTTP/WebSocket handlers, Fastify controllers, CLI commands
```

### Dependency Rules
- Dependencies **MUST** point inward only.
- **Domain** is completely independent and has no dependencies on other layers or frameworks.
- **Application** depends only on Domain.
- **Infrastructure** depends on Application and Domain.
- **Interfaces** depend on Application and Domain.
- Cross-service direct imports are **STRICTLY PROHIBITED**. Cross-service communication must flow through the NATS event broker or API Gateway proxy requests.

---

## 2. Event-Driven Communication

TikLivePro uses an event-driven system with NATS JetStream:

- All cross-service communication must trigger through subjects defined in `packages/events/src/subjects.ts`.
- Every event payload must contain:
  - `eventId` (UUIDv4)
  - `version` (Semantic version string)
  - `occurredAt` (ISO date-time)
  - `correlationId` (Required for trace tracking)
  - `traceId` (Required for telemetry tracking)
  - `payload` (Feature data)
- Consumers must deduplicate events using `eventId` to guarantee **idempotency**.
- Failed events must be routed to the Dead-Letter Queue stream `DLQ.*`.

---

## 3. Platform Extensibility

Third-party social platforms (TikTok, Facebook, YouTube, etc.) are integrated using adapters:

- Adapters must implement the `IPlatformAdapter` interface found in `packages/platform-adapters/src/interface/platform-adapter.interface.ts`.
- Core services like `live-session` and `comments` must remain decoupled from specific platforms and delegate all HTTP, stream, and comment-pull logic to `platform-adapters`.
- New platform adapters must be registered inside the `integrations` service.
