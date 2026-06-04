ALTER TABLE "stream_sessions" ADD COLUMN IF NOT EXISTS "recording_status" text NOT NULL DEFAULT 'none';
