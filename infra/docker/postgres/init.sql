-- Create databases for each service
CREATE DATABASE tiklive_auth;
CREATE DATABASE tiklive_users;
CREATE DATABASE tiklive_integrations;
CREATE DATABASE tiklive_sessions;
CREATE DATABASE tiklive_comments;
CREATE DATABASE tiklive_billing;
CREATE DATABASE tiklive_notifications;
CREATE DATABASE tiklive_analytics;

-- Each service gets its own schema for isolation
-- Services connect to their individual database (see .env.example in each service)
