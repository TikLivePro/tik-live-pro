ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "viewers_visible" boolean NOT NULL DEFAULT false;
