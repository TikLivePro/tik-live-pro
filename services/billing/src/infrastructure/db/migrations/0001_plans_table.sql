CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(20) NOT NULL,
	"name" varchar(50) NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_social_accounts" integer,
	"stripe_price_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug")
);
