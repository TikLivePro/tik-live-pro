CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"platform" varchar(20) NOT NULL,
	"platform_comment_id" varchar(255) NOT NULL,
	"author_name" varchar(255) NOT NULL,
	"author_avatar_url" text,
	"content" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_dedupe_uniq" UNIQUE("session_id","platform","platform_comment_id")
);
--> statement-breakpoint
CREATE INDEX "comments_session_id_idx" ON "comments" USING btree ("session_id");