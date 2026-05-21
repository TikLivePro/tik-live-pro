# ==============================================================================
# TikLivePro — Makefile
#
# Prerequisites
#   - Node.js >= 20         (https://nodejs.org)
#   - pnpm >= 9             (https://pnpm.io)
#   - Docker + Compose      (https://docs.docker.com/get-docker)
#
# Quickstart (first time)
#   make install            # install all dependencies
#   make infra-up           # start NATS, Postgres, Redis, Jaeger, Prometheus, Grafana
#   make dev                # start all backend services + web app
#
# Run `make help` to list every available target.
# ==============================================================================

# -- Config --------------------------------------------------------------------

TURBO   := pnpm turbo run --concurrency=15
DOCKER  := docker compose -f docker-compose.dev.yml

# Turbo --filter flags for every backend service
SERVICES := \
  --filter=@tik-live-pro/api-gateway \
  --filter=@tik-live-pro/auth-service \
  --filter=@tik-live-pro/users-service \
  --filter=@tik-live-pro/integrations-service \
  --filter=@tik-live-pro/live-session-service \
  --filter=@tik-live-pro/stream-orchestrator \
  --filter=@tik-live-pro/comments-service \
  --filter=@tik-live-pro/billing-service \
  --filter=@tik-live-pro/notifications-service \
  --filter=@tik-live-pro/analytics-service

# Turbo --filter flags for all shared packages
PACKAGES := \
  --filter=@tik-live-pro/shared-types \
  --filter=@tik-live-pro/events \
  --filter=@tik-live-pro/domain \
  --filter=@tik-live-pro/validation \
  --filter=@tik-live-pro/config \
  --filter=@tik-live-pro/logger \
  --filter=@tik-live-pro/i18n \
  --filter=@tik-live-pro/platform-adapters

# Declare all targets as phony (never match a file name)
.PHONY: \
  install \
  dev dev-services dev-web dev-mobile \
  infra-up infra-down infra-logs infra-ps infra-reset \
  build build-services build-web build-packages \
  start \
  test test-services test-packages test-watch \
  typecheck typecheck-services typecheck-web typecheck-mobile typecheck-packages \
  lint lint-fix \
  format \
  clean clean-dist clean-deps \
  db-generate db-migrate db-studio \
  db-logs nats-logs \
  logs-gateway logs-auth logs-users logs-integrations logs-live-session \
  logs-orchestrator logs-comments logs-billing logs-notifications logs-analytics \
  k8s-apply k8s-delete \
  help

# ==============================================================================
# DEPENDENCIES
# ==============================================================================

## install: Install all workspace dependencies
install:
	pnpm install

# ==============================================================================
# DEVELOPMENT
# ==============================================================================

## dev: Start all backend services + web app (no mobile)
##      Run this after `make infra-up`.
dev:
	$(TURBO) dev $(SERVICES) --filter=@tik-live-pro/web

## dev-services: Start backend services only (all 10 microservices)
##               Useful when the web app is already running separately.
dev-services:
	$(TURBO) dev $(SERVICES)

## dev-web: Start the Next.js web app only (port 3000, turbopack)
dev-web:
	$(TURBO) dev --filter=@tik-live-pro/web

## dev-mobile: Start the React Native dev server (Metro bundler)
##             Use `make android` or `make ios` in a separate terminal to run the app.
dev-mobile:
	$(TURBO) dev --filter=@tik-live-pro/mobile

## android: Build and launch the app on a connected Android device / emulator
android:
	pnpm --filter=@tik-live-pro/mobile run android

## ios: Build and launch the app on an iOS simulator (macOS only)
ios:
	pnpm --filter=@tik-live-pro/mobile run ios

# ==============================================================================
# INFRASTRUCTURE  (Docker Compose)
#
# Services started:
#   nats        NATS JetStream       4222 (client)  8222 (monitoring)
#   postgres    PostgreSQL 16        5432
#   redis       Redis 7              6379
#   otel        OpenTelemetry        4317 (gRPC)    4318 (HTTP)
#   jaeger      Jaeger tracing UI    16686
#   prometheus  Prometheus metrics   9090
#   grafana     Grafana dashboards   3001  (admin / admin)
# ==============================================================================

## infra-up: Start all local infrastructure services (detached)
infra-up:
	$(DOCKER) up -d
	@echo ""
	@echo "  Postgres    → localhost:5432"
	@echo "  Redis       → localhost:6379"
	@echo "  NATS        → localhost:4222  |  monitoring: http://localhost:8222"
	@echo "  Jaeger      → http://localhost:16686"
	@echo "  Prometheus  → http://localhost:9090"
	@echo "  Grafana     → http://localhost:3001  (admin / admin)"
	@echo ""

## infra-down: Stop all infrastructure containers (keep volumes)
infra-down:
	$(DOCKER) down

## infra-reset: Stop containers AND delete all data volumes (full wipe)
infra-reset:
	$(DOCKER) down -v
	@echo "All infrastructure volumes deleted."

## infra-logs: Stream logs from all infrastructure containers
infra-logs:
	$(DOCKER) logs -f

## infra-ps: Show running infrastructure containers and their ports
infra-ps:
	$(DOCKER) ps

## db-logs: Stream Postgres logs only
db-logs:
	$(DOCKER) logs -f postgres

## nats-logs: Stream NATS logs only
nats-logs:
	$(DOCKER) logs -f nats

# ==============================================================================
# BUILD
# ==============================================================================

## build: Build everything — packages first, then services and web (respects deps)
build:
	$(TURBO) build

## build-packages: Build shared packages only
build-packages:
	$(TURBO) build $(PACKAGES)

## build-services: Build all backend services (requires packages to be built first)
build-services:
	$(TURBO) build $(SERVICES)

## build-web: Build the Next.js web app for production
build-web:
	$(TURBO) build --filter=@tik-live-pro/web

## start: Start all services from compiled dist/ output (production mode)
##        Run `make build` first.
start:
	$(TURBO) start $(SERVICES) --filter=@tik-live-pro/web

# ==============================================================================
# TESTING
# ==============================================================================

## test: Run the full test suite across all packages and services
test:
	$(TURBO) test

## test-services: Run tests for backend services only
test-services:
	$(TURBO) test $(SERVICES)

## test-packages: Run tests for shared packages that have them (domain, platform-adapters)
test-packages:
	$(TURBO) test --filter=@tik-live-pro/domain --filter=@tik-live-pro/platform-adapters

## test-watch: Run tests in watch mode for a specific package
##   Usage: make test-watch pkg=@tik-live-pro/auth-service
test-watch:
ifndef pkg
	$(error pkg is required. Usage: make test-watch pkg=@tik-live-pro/auth-service)
endif
	pnpm --filter=$(pkg) run test -- --watch

# ==============================================================================
# TYPE CHECKING
# ==============================================================================

## typecheck: Type-check everything (packages, services, web, mobile)
typecheck:
	$(TURBO) typecheck

## typecheck-services: Type-check backend services only
typecheck-services:
	$(TURBO) typecheck $(SERVICES)

## typecheck-web: Type-check the Next.js web app
typecheck-web:
	$(TURBO) typecheck --filter=@tik-live-pro/web

## typecheck-mobile: Type-check the React Native mobile app
typecheck-mobile:
	$(TURBO) typecheck --filter=@tik-live-pro/mobile

## typecheck-packages: Type-check all shared packages
typecheck-packages:
	$(TURBO) typecheck $(PACKAGES)

# ==============================================================================
# LINTING & FORMATTING
# ==============================================================================

## lint: Run ESLint across all packages, services, and apps
lint:
	$(TURBO) lint

## lint-fix: Run ESLint with --fix (auto-corrects fixable violations)
lint-fix:
	$(TURBO) lint -- --fix

## format: Format all TypeScript, JSON and Markdown files with Prettier
format:
	pnpm prettier --write "**/*.{ts,tsx,json,md}"

# ==============================================================================
# DATABASE
#
# db-generate  — reads each service's schema.ts and outputs SQL migration files.
#                No running database required.
#
# db-migrate   — applies pending migrations to each service's database.
#                Requires Postgres to be running (make infra-up).
#                Override the host/credentials with DB_BASE_URL:
#                  DB_BASE_URL=postgresql://user:pass@host:5432 make db-migrate
#
# db-studio    — opens Drizzle Studio for a single service.
#                  Usage: make db-studio svc=auth
# ==============================================================================

## db-generate: Generate SQL migration files for all services (no DB needed)
db-generate:
	bash scripts/db-generate.sh

## db-migrate: Apply pending migrations to every service database
db-migrate:
	bash scripts/db-migrate.sh

## db-studio: Open Drizzle Studio for one service  (usage: make db-studio svc=auth)
db-studio:
ifndef svc
	$(error svc is required. Usage: make db-studio svc=auth)
endif
	pnpm --filter=@tik-live-pro/$(svc)-service run db:studio 2>/dev/null || \
	pnpm --filter=@tik-live-pro/$(svc) run db:studio

# ==============================================================================
# CLEANUP
# ==============================================================================

## clean: Remove all build artifacts and node_modules (full reset)
clean: clean-dist clean-deps

## clean-dist: Remove compiled output (dist/, .next/) in every workspace
clean-dist:
	$(TURBO) clean

## clean-deps: Remove all node_modules directories across the monorepo
clean-deps:
	find . -name "node_modules" -type d -prune -exec rm -rf {} + 2>/dev/null || true
	@echo "All node_modules removed. Run 'make install' to reinstall."

# ==============================================================================
# SERVICE LOGS  (individual service log tailing via pnpm/turbo filter)
#
# These targets stream stdout from a single service dev process.
# The service must already be running (e.g. started with `make dev-services`).
# ==============================================================================

## logs-gateway: Stream API Gateway logs
logs-gateway:
	pnpm --filter=@tik-live-pro/api-gateway run dev

## logs-auth: Stream Auth service logs
logs-auth:
	pnpm --filter=@tik-live-pro/auth-service run dev

## logs-users: Stream Users service logs
logs-users:
	pnpm --filter=@tik-live-pro/users-service run dev

## logs-integrations: Stream Integrations service logs
logs-integrations:
	pnpm --filter=@tik-live-pro/integrations-service run dev

## logs-live-session: Stream Live Session service logs
logs-live-session:
	pnpm --filter=@tik-live-pro/live-session-service run dev

## logs-orchestrator: Stream Stream Orchestrator logs
logs-orchestrator:
	pnpm --filter=@tik-live-pro/stream-orchestrator run dev

## logs-comments: Stream Comments service logs
logs-comments:
	pnpm --filter=@tik-live-pro/comments-service run dev

## logs-billing: Stream Billing service logs
logs-billing:
	pnpm --filter=@tik-live-pro/billing-service run dev

## logs-notifications: Stream Notifications service logs
logs-notifications:
	pnpm --filter=@tik-live-pro/notifications-service run dev

## logs-analytics: Stream Analytics service logs
logs-analytics:
	pnpm --filter=@tik-live-pro/analytics-service run dev

# ==============================================================================
# KUBERNETES
# ==============================================================================

## k8s-apply: Apply all Kubernetes manifests in infra/kubernetes/
k8s-apply:
	kubectl apply -f infra/kubernetes/

## k8s-delete: Delete all resources defined in infra/kubernetes/
k8s-delete:
	kubectl delete -f infra/kubernetes/

# ==============================================================================
# HELP
# ==============================================================================

## help: Print this help message (all documented targets)
help:
	@echo ""
	@echo "TikLivePro — available make targets"
	@echo "===================================="
	@grep -E '^## ' $(MAKEFILE_LIST) \
		| sed 's/^## //' \
		| awk -F': ' '{ printf "  \033[36m%-32s\033[0m %s\n", $$1, $$2 }'
	@echo ""
	@echo "Service ports (once running):"
	@echo "  api-gateway       → http://localhost:3000  (docs: /docs)"
	@echo "  auth              → http://localhost:3001  (docs: /docs)"
	@echo "  users             → http://localhost:3002  (docs: /docs)"
	@echo "  live-session      → http://localhost:3003  (docs: /docs)"
	@echo "  billing           → http://localhost:3004  (docs: /docs)"
	@echo "  integrations      → http://localhost:3005  (docs: /docs)"
	@echo "  comments          → http://localhost:3006  (docs: /docs)"
	@echo "  notifications     → http://localhost:3007  (docs: /docs)"
	@echo "  analytics         → http://localhost:3008  (docs: /docs)"
	@echo "  stream-orchestr.  → http://localhost:3009  (docs: /docs)"
	@echo "  web app           → http://localhost:3000"
	@echo ""

.DEFAULT_GOAL := help
