CREATE TABLE "viewer_peaks" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"peak_viewers" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
