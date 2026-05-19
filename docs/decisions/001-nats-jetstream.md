# ADR-001: Use NATS JetStream as Event Bus

**Date**: 2026-05-19  
**Status**: Accepted

## Context

TikLivePro requires an event bus for cross-service communication:
- High-throughput comment ingestion (potentially thousands per second per stream)
- Reliable delivery for billing events
- Low-latency session lifecycle events
- Observability metadata propagation

Candidates evaluated:
1. **NATS JetStream** — persistent, at-least-once, low-latency, cloud-native
2. **Apache Kafka** — proven at extreme scale, higher operational overhead
3. **Redis Streams** — simple, already in stack, less mature ecosystem

## Decision

Use **NATS JetStream**.

## Rationale

- Native at-least-once delivery with configurable retention per stream
- Sub-millisecond latency for session and stream events
- Built-in consumer groups (durable consumers) with exactly-once semantics via `nats.dedup`
- Simpler operational model than Kafka for early-stage product (single binary, low memory)
- Dead-letter queue support via subject routing
- Easy migration to Kafka later if volume demands it (subjects map to Kafka topics)

## Consequences

- Delivery guarantee is **at-least-once** — consumers must be idempotent
- JetStream requires persistent storage — use file-based backend in prod, configure replicas ≥ 3
- Max message size default is 1MB; comments payload is small, no issue
- NATS 3-node cluster needed for HA in production (see `infra/kubernetes/nats-deployment.yaml`)
