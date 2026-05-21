CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(254) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"avatar_url" text,
	"subscription_tier" varchar(20) DEFAULT 'free' NOT NULL,
	"locale" varchar(10) DEFAULT 'en' NOT NULL,
	"social_account_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
