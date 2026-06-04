CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"ingest_key" text NOT NULL,
	"file_key" text NOT NULL,
	"public_url" text NOT NULL,
	"file_name" text NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_session_id_stream_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."stream_sessions"("session_id") ON DELETE cascade ON UPDATE no action;
