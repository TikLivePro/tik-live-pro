CREATE INDEX IF NOT EXISTS "comments_session_received_idx" ON "comments" USING btree ("session_id","received_at" DESC NULLS LAST);
