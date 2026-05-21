CREATE TABLE "analytics_platform_stats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"avg_bitrate_kbps" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_platform_stats_session_platform_uniq" UNIQUE("session_id","platform")
);
--> statement-breakpoint
CREATE TABLE "analytics_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"total_comments" integer DEFAULT 0 NOT NULL,
	"final_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "stream_health_samples" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"sampled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bitrate_kbps" integer NOT NULL,
	"fps" real NOT NULL,
	"dropped_frames" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer
);
--> statement-breakpoint
CREATE INDEX "analytics_sessions_user_id_idx" ON "analytics_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stream_health_session_time_idx" ON "stream_health_samples" USING btree ("session_id","sampled_at");