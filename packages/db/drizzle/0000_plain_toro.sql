CREATE TABLE "auth_nonces" (
	"nonce" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "auth_nonces_user_id_nonce_pk" PRIMARY KEY("user_id","nonce")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" bigint NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "group_message_queue" (
	"queued_msg_id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"from_user_id" text NOT NULL,
	"ciphertext" text NOT NULL,
	"header" text NOT NULL,
	"client_msg_id" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"group_id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by_user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_queue" (
	"queued_msg_id" serial PRIMARY KEY NOT NULL,
	"to_user_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"ciphertext" text NOT NULL,
	"header" text NOT NULL,
	"client_msg_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint
);
--> statement-breakpoint
CREATE TABLE "prekeys" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"signed_pre_key_id" integer NOT NULL,
	"signed_pre_key_public" text NOT NULL,
	"signed_pre_key_signature" text NOT NULL,
	"one_time_pre_key_id" integer,
	"one_time_pre_key_public" text,
	"is_used" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"identity_public_key" text NOT NULL,
	"signal_identity_public_key" text NOT NULL,
	"registration_id" integer NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "users_identity_public_key_unique" UNIQUE("identity_public_key"),
	CONSTRAINT "users_signal_identity_public_key_unique" UNIQUE("signal_identity_public_key")
);
--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("group_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_message_queue" ADD CONSTRAINT "group_message_queue_group_id_groups_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("group_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_message_queue" ADD CONSTRAINT "group_message_queue_from_user_id_users_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_user_id_users_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_queue" ADD CONSTRAINT "message_queue_to_user_id_users_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_queue" ADD CONSTRAINT "message_queue_from_user_id_users_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prekeys" ADD CONSTRAINT "prekeys_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_members_group_id_idx" ON "group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_members_user_id_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "group_message_queue_group_id_idx" ON "group_message_queue" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_message_queue_group_from_client_unique" ON "group_message_queue" USING btree ("group_id","from_user_id","client_msg_id");--> statement-breakpoint
CREATE INDEX "message_queue_to_user_id_idx" ON "message_queue" USING btree ("to_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_queue_to_from_client_msg_unique" ON "message_queue" USING btree ("to_user_id","from_user_id","client_msg_id");--> statement-breakpoint
CREATE INDEX "prekeys_user_id_idx" ON "prekeys" USING btree ("user_id");