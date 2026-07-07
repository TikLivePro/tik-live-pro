CREATE INDEX IF NOT EXISTS "recordings_session_id_idx" ON "recordings" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stream_destinations_session_id_idx" ON "stream_destinations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stream_sessions_status_idx" ON "stream_sessions" USING btree ("status");
