-- ==============================================================================
-- PostgreSQL init script — tik-live-pro
--
-- Executed once when the postgres container is first created (fresh volume).
-- Creates one database per microservice so each service is fully isolated.
--
-- Connection strings (from each service's .env):
--   tiklivepro_auth          → auth-service          (port 3001)
--   tiklivepro_users         → users-service          (port 3002)
--   tiklivepro_sessions      → live-session-service   (port 3003)
--   tiklivepro_billing       → billing-service        (port 3004)
--   tiklivepro_integrations  → integrations-service   (port 3005)
--   tiklivepro_comments      → comments-service       (port 3006)
--   tiklivepro_notifications → notifications-service  (port 3007)
--   tiklivepro_analytics     → analytics-service      (port 3008)
--   tiklivepro_stream        → stream-orchestrator    (port 3009)
-- ==============================================================================

-- Use IF NOT EXISTS guards so re-running this script is safe.
SELECT 'CREATE DATABASE tiklivepro_auth'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklivepro_auth')\gexec

SELECT 'CREATE DATABASE tiklivepro_users'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklivepro_users')\gexec

SELECT 'CREATE DATABASE tiklivepro_sessions'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklivepro_sessions')\gexec

SELECT 'CREATE DATABASE tiklivepro_billing'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklivepro_billing')\gexec

SELECT 'CREATE DATABASE tiklivepro_integrations'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklivepro_integrations')\gexec

SELECT 'CREATE DATABASE tiklivepro_comments'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklivepro_comments')\gexec

SELECT 'CREATE DATABASE tiklivepro_notifications'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklivepro_notifications')\gexec

SELECT 'CREATE DATABASE tiklivepro_analytics'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklivepro_analytics')\gexec

-- Added: stream-orchestrator database
SELECT 'CREATE DATABASE tiklivepro_stream'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklivepro_stream')\gexec
