import { TRPCError, initTRPC } from "@trpc/server";
import { and, eq, gt, inArray } from "drizzle-orm";
import {
  groupMembers,
  groupMessageQueue,
  groups,
  messageQueue,
  prekeys,
  users,
} from "@workspace/db/schema";
import {
  groupAckDeleteSchema,
  groupAddMembersSchema,
  groupCreateSchema,
  groupGetMembersSchema,
  groupListMineSchema,
  groupPollSchema,
  groupPostSchema,
  identityGetBundleSchema,
  identityRegisterBundleSchema,
  messageAckDeleteSchema,
  messagePollSchema,
  messageSendSchema,
} from "@workspace/shared";
import { assertAuthenticated } from "./auth.js";
import { db } from "./db.js";

const t = initTRPC.create();

function unauthorized(message: string): never {
  throw new TRPCError({ code: "UNAUTHORIZED", message });
}

function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

function forbidden(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

async function requireAuth(
  procedure: string,
  auth: Parameters<typeof assertAuthenticated>[1],
  payload: Parameters<typeof assertAuthenticated>[2],
): Promise<string> {
  try {
    return await assertAuthenticated(procedure, auth, payload);
  } catch (error) {
    unauthorized(error instanceof Error ? error.message : "auth failed");
  }
}

export const appRouter = t.router({
  identity: t.router({
    registerBundle: t.procedure.input(identityRegisterBundleSchema).mutation(async ({ input }) => {
      const { auth, ...payload } = input;
      const userId = await requireAuth("identity.registerBundle", auth, payload);

      const now = Date.now();

      await db
        .insert(users)
        .values({
          userId,
          identityPublicKey: auth.identityPublicKey,
          signalIdentityPublicKey: payload.signalIdentityPublicKey,
          registrationId: payload.registrationId,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: users.userId,
          set: {
            identityPublicKey: auth.identityPublicKey,
            signalIdentityPublicKey: payload.signalIdentityPublicKey,
            registrationId: payload.registrationId,
          },
        });

      await db.delete(prekeys).where(eq(prekeys.userId, userId));

      await db.insert(prekeys).values(
        payload.oneTimePreKeys.map((item) => ({
          userId,
          signedPreKeyId: payload.signedPreKey.keyId,
          signedPreKeyPublic: payload.signedPreKey.publicKey,
          signedPreKeySignature: payload.signedPreKey.signature,
          oneTimePreKeyId: item.keyId,
          oneTimePreKeyPublic: item.publicKey,
          isUsed: false,
          createdAt: now,
        })),
      );

      return { ok: true as const };
    }),

    getBundle: t.procedure.input(identityGetBundleSchema).query(async ({ input }) => {
      const identityRows = await db.select().from(users).where(eq(users.userId, input.userId)).limit(1);
      const identity = identityRows[0];

      if (!identity) {
        throw new TRPCError({ code: "NOT_FOUND", message: "user not found" });
      }

      const prekeyRows = await db
        .select()
        .from(prekeys)
        .where(and(eq(prekeys.userId, input.userId), eq(prekeys.isUsed, false)))
        .orderBy(prekeys.id)
        .limit(1);
      const prekey = prekeyRows[0];

      if (!prekey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "no prekey bundle" });
      }

      if (prekey.oneTimePreKeyId !== null) {
        await db.update(prekeys).set({ isUsed: true }).where(eq(prekeys.id, prekey.id));
      }

      return {
        registrationId: identity.registrationId,
        signalIdentityPublicKey: identity.signalIdentityPublicKey,
        signedPreKey: {
          keyId: prekey.signedPreKeyId,
          publicKey: prekey.signedPreKeyPublic,
          signature: prekey.signedPreKeySignature,
        },
        oneTimePreKey:
          prekey.oneTimePreKeyId !== null && prekey.oneTimePreKeyPublic !== null
            ? {
                keyId: prekey.oneTimePreKeyId,
                publicKey: prekey.oneTimePreKeyPublic,
              }
            : null,
      };
    }),
  }),

  message: t.router({
    send: t.procedure.input(messageSendSchema).mutation(async ({ input }) => {
      const { auth, ...payload } = input;
      const fromUserId = await requireAuth("message.send", auth, payload);

      const targetRows = await db.select({ userId: users.userId }).from(users).where(eq(users.userId, payload.toUserId)).limit(1);
      if (!targetRows[0]) {
        badRequest("target user not found");
      }

      const inserted = await db
        .insert(messageQueue)
        .values({
          toUserId: payload.toUserId,
          fromUserId,
          ciphertext: payload.ciphertext,
          header: payload.header,
          clientMsgId: payload.clientMsgId,
          createdAt: payload.createdAt,
        })
        .onConflictDoNothing()
        .returning({ queuedMsgId: messageQueue.queuedMsgId });

      if (!inserted[0]) {
        const existing = await db
          .select({ queuedMsgId: messageQueue.queuedMsgId })
          .from(messageQueue)
          .where(
            and(
              eq(messageQueue.toUserId, payload.toUserId),
              eq(messageQueue.fromUserId, fromUserId),
              eq(messageQueue.clientMsgId, payload.clientMsgId),
            ),
          )
          .limit(1);

        return { queuedMsgId: existing[0]?.queuedMsgId ?? -1 };
      }

      return inserted[0];
    }),

    poll: t.procedure.input(messagePollSchema).query(async ({ input }) => {
      const { auth, since } = input;
      const userId = await requireAuth("message.poll", auth, { since });

      const conditions = [eq(messageQueue.toUserId, userId)];
      if (since) {
        conditions.push(gt(messageQueue.createdAt, since));
      }

      return db.select().from(messageQueue).where(and(...conditions)).orderBy(messageQueue.createdAt);
    }),

    ackDelete: t.procedure.input(messageAckDeleteSchema).mutation(async ({ input }) => {
      const { auth, ...payload } = input;
      const userId = await requireAuth("message.ackDelete", auth, payload);

      await db
        .delete(messageQueue)
        .where(and(eq(messageQueue.queuedMsgId, payload.queuedMsgId), eq(messageQueue.toUserId, userId)));

      return { ok: true as const };
    }),
  }),

  group: t.router({
    create: t.procedure.input(groupCreateSchema).mutation(async ({ input }) => {
      const { auth, ...payload } = input;
      const userId = await requireAuth("group.create", auth, payload);

      const memberUserIds = Array.from(new Set([userId, ...payload.memberUserIds]));
      const knownUsers = await db.select({ userId: users.userId }).from(users).where(inArray(users.userId, memberUserIds));
      if (knownUsers.length !== memberUserIds.length) {
        badRequest("unknown userId included");
      }

      const now = Date.now();
      const created = await db
        .insert(groups)
        .values({
          name: payload.name,
          createdAt: now,
          createdByUserId: userId,
        })
        .returning({ groupId: groups.groupId });

      const groupId = created[0]?.groupId;
      if (!groupId) {
        badRequest("failed to create group");
      }

      await db.insert(groupMembers).values(
        memberUserIds.map((memberUserId) => ({
          groupId,
          userId: memberUserId,
          role: memberUserId === userId ? ("owner" as const) : ("member" as const),
          joinedAt: now,
        })),
      );

      return { groupId };
    }),

    addMembers: t.procedure.input(groupAddMembersSchema).mutation(async ({ input }) => {
      const { auth, ...payload } = input;
      const userId = await requireAuth("group.addMembers", auth, payload);

      const actorRows = await db
        .select()
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, payload.groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      const actor = actorRows[0];

      if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
        forbidden("insufficient role");
      }

      const knownUsers = await db.select({ userId: users.userId }).from(users).where(inArray(users.userId, payload.memberUserIds));
      if (knownUsers.length !== payload.memberUserIds.length) {
        badRequest("unknown userId included");
      }

      await db
        .insert(groupMembers)
        .values(
          payload.memberUserIds.map((memberUserId) => ({
            groupId: payload.groupId,
            userId: memberUserId,
            role: "member" as const,
            joinedAt: Date.now(),
          })),
        )
        .onConflictDoNothing();

      return { ok: true as const };
    }),

    listMine: t.procedure.input(groupListMineSchema).query(async ({ input }) => {
      const userId = await requireAuth("group.listMine", input.auth, {});

      const rows = await db
        .select({
          groupId: groups.groupId,
          name: groups.name,
          createdAt: groups.createdAt,
          createdByUserId: groups.createdByUserId,
          role: groupMembers.role,
        })
        .from(groupMembers)
        .innerJoin(groups, eq(groups.groupId, groupMembers.groupId))
        .where(eq(groupMembers.userId, userId))
        .orderBy(groups.createdAt);

      return rows;
    }),

    getMembers: t.procedure.input(groupGetMembersSchema).query(async ({ input }) => {
      const { auth, groupId } = input;
      const userId = await requireAuth("group.getMembers", auth, { groupId });

      const selfRows = await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);

      if (!selfRows[0]) {
        forbidden("not a group member");
      }

      return db
        .select({ userId: groupMembers.userId, role: groupMembers.role, joinedAt: groupMembers.joinedAt })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, groupId));
    }),

    post: t.procedure.input(groupPostSchema).mutation(async ({ input }) => {
      const { auth, ...payload } = input;
      const userId = await requireAuth("group.post", auth, payload);

      const memberRows = await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, payload.groupId), eq(groupMembers.userId, userId)))
        .limit(1);

      if (!memberRows[0]) {
        forbidden("not a group member");
      }

      const inserted = await db
        .insert(groupMessageQueue)
        .values({
          groupId: payload.groupId,
          fromUserId: userId,
          ciphertext: payload.ciphertext,
          header: payload.header,
          clientMsgId: payload.clientMsgId,
          createdAt: payload.createdAt,
        })
        .onConflictDoNothing()
        .returning({ queuedMsgId: groupMessageQueue.queuedMsgId });

      if (!inserted[0]) {
        const existing = await db
          .select({ queuedMsgId: groupMessageQueue.queuedMsgId })
          .from(groupMessageQueue)
          .where(
            and(
              eq(groupMessageQueue.groupId, payload.groupId),
              eq(groupMessageQueue.fromUserId, userId),
              eq(groupMessageQueue.clientMsgId, payload.clientMsgId),
            ),
          )
          .limit(1);
        return { queuedMsgId: existing[0]?.queuedMsgId ?? -1 };
      }

      return inserted[0];
    }),

    poll: t.procedure.input(groupPollSchema).query(async ({ input }) => {
      const { auth, groupId, since } = input;
      const userId = await requireAuth("group.poll", auth, { groupId, since });

      const memberRows = await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (!memberRows[0]) {
        forbidden("not a group member");
      }

      const conditions = [eq(groupMessageQueue.groupId, groupId)];
      if (since) {
        conditions.push(gt(groupMessageQueue.createdAt, since));
      }

      return db.select().from(groupMessageQueue).where(and(...conditions)).orderBy(groupMessageQueue.createdAt);
    }),

    ackDelete: t.procedure.input(groupAckDeleteSchema).mutation(async ({ input }) => {
      const { auth, ...payload } = input;
      const userId = await requireAuth("group.ackDelete", auth, payload);

      const rows = await db
        .select({ groupId: groupMessageQueue.groupId })
        .from(groupMessageQueue)
        .where(eq(groupMessageQueue.queuedMsgId, payload.queuedMsgId))
        .limit(1);
      const row = rows[0];

      if (!row) {
        return { ok: true as const };
      }

      const memberRows = await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, row.groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (!memberRows[0]) {
        forbidden("not a group member");
      }

      return { ok: true as const };
    }),
  }),
});

export type AppRouter = typeof appRouter;
