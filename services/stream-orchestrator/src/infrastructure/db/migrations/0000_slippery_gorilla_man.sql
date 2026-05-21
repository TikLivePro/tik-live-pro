CREATE TABLE "stream_destinations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"social_account_id" text NOT NULL,
	"platform" text NOT NULL,
	"rtmp_url" text,
	"stream_key" text,
	"platform_stream_id" text,
	"stream_key_expires_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_sessions" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'idle' NOT NULL,
	"pending_account_ids" jsonb NOT NULL,
	"ingest_key" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stream_sessions_ingest_key_unique" UNIQUE("ingest_key")
);
--> statement-breakpoint
ALTER TABLE "stream_destinations" ADD CONSTRAINT "stream_destinations_session_id_stream_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."stream_sessions"("session_id") ON DELETE cascade ON UPDATE no action;