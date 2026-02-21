import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  userId: text("user_id").primaryKey(),
  identityPublicKey: text("identity_public_key").notNull().unique(),
  signalIdentityPublicKey: text("signal_identity_public_key").notNull().unique(),
  registrationId: integer("registration_id").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const prekeys = pgTable("prekeys", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.userId),
  signedPreKeyId: integer("signed_pre_key_id").notNull(),
  signedPreKeyPublic: text("signed_pre_key_public").notNull(),
  signedPreKeySignature: text("signed_pre_key_signature").notNull(),
  oneTimePreKeyId: integer("one_time_pre_key_id"),
  oneTimePreKeyPublic: text("one_time_pre_key_public"),
  isUsed: boolean("is_used").notNull().default(false),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => [index("prekeys_user_id_idx").on(table.userId)]);

export const messageQueue = pgTable("message_queue", {
  queuedMsgId: serial("queued_msg_id").primaryKey(),
  toUserId: text("to_user_id").notNull().references(() => users.userId),
  fromUserId: text("from_user_id").notNull().references(() => users.userId),
  ciphertext: text("ciphertext").notNull(),
  header: text("header").notNull(),
  clientMsgId: text("client_msg_id").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }),
}, (table) => [
  index("message_queue_to_user_id_idx").on(table.toUserId),
  uniqueIndex("message_queue_to_from_client_msg_unique").on(table.toUserId, table.fromUserId, table.clientMsgId),
]);

export const groups = pgTable("groups", {
  groupId: serial("group_id").primaryKey(),
  name: text("name").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.userId),
});

export const groupMembers = pgTable("group_members", {
  groupId: integer("group_id").notNull().references(() => groups.groupId),
  userId: text("user_id").notNull().references(() => users.userId),
  role: text("role", { enum: ["owner", "admin", "member"] }).notNull().default("member"),
  joinedAt: bigint("joined_at", { mode: "number" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.groupId, table.userId] }),
  index("group_members_group_id_idx").on(table.groupId),
  index("group_members_user_id_idx").on(table.userId),
]);

export const groupMessageQueue = pgTable("group_message_queue", {
  queuedMsgId: serial("queued_msg_id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.groupId),
  fromUserId: text("from_user_id").notNull().references(() => users.userId),
  ciphertext: text("ciphertext").notNull(),
  header: text("header").notNull(),
  clientMsgId: text("client_msg_id").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => [
  index("group_message_queue_group_id_idx").on(table.groupId),
  uniqueIndex("group_message_queue_group_from_client_unique").on(table.groupId, table.fromUserId, table.clientMsgId),
]);

export const authNonces = pgTable("auth_nonces", {
  nonce: text("nonce").notNull(),
  userId: text("user_id").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.nonce] })]);
