import { z } from "zod";

const b64url = /^[A-Za-z0-9_-]+$/;
const b64 = /^[A-Za-z0-9+/=]+$/;

export const authEnvelopeSchema = z.object({
  userId: z.string().min(8),
  identityPublicKey: z.string().regex(b64url),
  nonce: z.string().min(12),
  signature: z.string().regex(b64url),
});

export const preKeySchema = z.object({
  keyId: z.number().int().nonnegative(),
  publicKey: z.string().regex(b64),
});

export const signedPreKeySchema = z.object({
  keyId: z.number().int().nonnegative(),
  publicKey: z.string().regex(b64),
  signature: z.string().regex(b64),
});

export const identityRegisterBundleSchema = z.object({
  auth: authEnvelopeSchema,
  signalIdentityPublicKey: z.string().regex(b64),
  registrationId: z.number().int().nonnegative(),
  signedPreKey: signedPreKeySchema,
  oneTimePreKeys: z.array(preKeySchema).min(1).max(100),
});

export const identityGetBundleSchema = z.object({
  userId: z.string().min(8),
});

export const messageSendSchema = z.object({
  auth: authEnvelopeSchema,
  toUserId: z.string().min(8),
  ciphertext: z.string().min(1),
  header: z.string().min(1),
  clientMsgId: z.string().min(4),
  createdAt: z.number().int().positive(),
});

export const messagePollSchema = z.object({
  auth: authEnvelopeSchema,
  since: z.number().int().nonnegative().optional(),
});

export const messageAckDeleteSchema = z.object({
  auth: authEnvelopeSchema,
  queuedMsgId: z.number().int().positive(),
});

export const groupCreateSchema = z.object({
  auth: authEnvelopeSchema,
  name: z.string().min(1).max(100),
  memberUserIds: z.array(z.string().min(8)).max(128),
});

export const groupAddMembersSchema = z.object({
  auth: authEnvelopeSchema,
  groupId: z.number().int().positive(),
  memberUserIds: z.array(z.string().min(8)).min(1).max(128),
});

export const groupPostSchema = z.object({
  auth: authEnvelopeSchema,
  groupId: z.number().int().positive(),
  ciphertext: z.string().min(1),
  header: z.string().min(1),
  clientMsgId: z.string().min(4),
  createdAt: z.number().int().positive(),
});

export const groupPollSchema = z.object({
  auth: authEnvelopeSchema,
  groupId: z.number().int().positive(),
  since: z.number().int().nonnegative().optional(),
});

export const groupAckDeleteSchema = z.object({
  auth: authEnvelopeSchema,
  queuedMsgId: z.number().int().positive(),
});

export const groupListMineSchema = z.object({
  auth: authEnvelopeSchema,
});

export const groupGetMembersSchema = z.object({
  auth: authEnvelopeSchema,
  groupId: z.number().int().positive(),
});

export type AuthEnvelope = z.infer<typeof authEnvelopeSchema>;
