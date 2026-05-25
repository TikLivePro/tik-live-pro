ALTER TABLE "comments" ADD COLUMN "author_platform_user_id" varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "reply_to_comment_id" uuid;