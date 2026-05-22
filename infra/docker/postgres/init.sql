-- ==============================================================================
-- PostgreSQL init script — tik-live-pro
--
-- Executed once when the postgres container is first created (fresh volume).
-- Creates one database per microservice so each service is fully isolated.
--
-- Connection strings (from each service's .env):
--   tiklive_auth          → auth-service          (port 3001)
--   tiklive_users         → users-service          (port 3002)
--   tiklive_sessions      → live-session-service   (port 3003)
--   tiklive_billing       → billing-service        (port 3004)
--   tiklive_integrations  → integrations-service   (port 3005)
--   tiklive_comments      → comments-service       (port 3006)
--   tiklive_notifications → notifications-service  (port 3007)
--   tiklive_analytics     → analytics-service      (port 3008)
--   tiklive_stream        → stream-orchestrator    (port 3009)
-- ==============================================================================

-- Use IF NOT EXISTS guards so re-running this script is safe.
SELECT 'CREATE DATABASE tiklive_auth'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklive_auth')\gexec

SELECT 'CREATE DATABASE tiklive_users'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklive_users')\gexec

SELECT 'CREATE DATABASE tiklive_sessions'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklive_sessions')\gexec

SELECT 'CREATE DATABASE tiklive_billing'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklive_billing')\gexec

SELECT 'CREATE DATABASE tiklive_integrations'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklive_integrations')\gexec

SELECT 'CREATE DATABASE tiklive_comments'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklive_comments')\gexec

SELECT 'CREATE DATABASE tiklive_notifications'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklive_notifications')\gexec

SELECT 'CREATE DATABASE tiklive_analytics'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklive_analytics')\gexec

-- Added: stream-orchestrator database
SELECT 'CREATE DATABASE tiklive_stream'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklive_stream')\gexec
