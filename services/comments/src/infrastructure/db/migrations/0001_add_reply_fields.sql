ALTER TABLE "comments"
  ADD COLUMN IF NOT EXISTS "author_platform_user_id" varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "reply_to_comment_id" uuid;
