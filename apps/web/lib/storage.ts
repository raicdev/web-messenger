import type { Direction, KeyPairType, SessionRecordType, StorageType } from "@privacyresearch/libsignal-protocol-typescript";
import { openDB, type IDBPDatabase } from "idb";
import type { LocalIdentity } from "./crypto";
import { base64ToArrayBuffer } from "./encoding";

export type Contact = {
  userId: string;
  signalIdentityPublicKey: string;
  hasKeyMismatch: boolean;
  addedAt: number;
  displayName?: string;
  handle?: string;
};

export type DirectMessage = {
  id?: number;
  peerUserId: string;
  direction: "in" | "out";
  body: string;
  kind?: "text" | "media";
  editedAt?: number;
  isDeletedForEveryone?: boolean;
  isPinned?: boolean;
  reactions?: Record<string, string[]>;
  clientMsgId?: string;
  replyToClientMsgId?: string;
  replyToText?: string;
  replyToSender?: string;
  attachments?: MessageAttachment[];
  createdAt: number;
};

export type GroupInfo = {
  groupId: number;
  name: string;
  role: "owner" | "admin" | "member";
  createdAt: number;
  createdByUserId: string;
};

export type GroupMessage = {
  id?: number;
  groupId: number;
  fromUserId: string;
  body: string;
  kind?: "text" | "media";
  editedAt?: number;
  isDeletedForEveryone?: boolean;
  isPinned?: boolean;
  reactions?: Record<string, string[]>;
  clientMsgId?: string;
  replyToClientMsgId?: string;
  replyToText?: string;
  replyToSender?: string;
  attachments?: MessageAttachment[];
  createdAt: number;
};

export type MessageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataBase64: string;
};

export type UserProfile = {
  displayName: string;
  handle: string;
  about: string;
  updatedAt: number;
};

type SenderKey = {
  id: string;
  groupId: number;
  senderUserId: string;
  senderKeyId: number;
  keyMaterial: string;
  createdAt: number;
};

type MessengerDb = {
  kv: {
    key: string;
    value: unknown;
  };
  contacts: {
    key: string;
    value: Contact;
  };
  direct_messages: {
    key: number;
    value: DirectMessage;
    indexes: { "by-peer": string };
  };
  groups: {
    key: number;
    value: GroupInfo;
  };
  group_messages: {
    key: number;
    value: GroupMessage;
    indexes: { "by-group": number };
  };
  sender_keys: {
    key: string;
    value: SenderKey;
  };
};

let dbPromise: Promise<IDBPDatabase<MessengerDb>> | null = null;

function getDb(): Promise<IDBPDatabase<MessengerDb>> {
  if (!dbPromise) {
    dbPromise = openDB<MessengerDb>("web-messenger", 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("kv")) {
          db.createObjectStore("kv");
        }
        if (!db.objectStoreNames.contains("contacts")) {
          db.createObjectStore("contacts", { keyPath: "userId" });
        }
        if (!db.objectStoreNames.contains("direct_messages")) {
          const direct = db.createObjectStore("direct_messages", {
            keyPath: "id",
            autoIncrement: true,
          });
          direct.createIndex("by-peer", "peerUserId");
        }
        if (!db.objectStoreNames.contains("groups")) {
          db.createObjectStore("groups", { keyPath: "groupId" });
        }
        if (!db.objectStoreNames.contains("group_messages")) {
          const groupMessages = db.createObjectStore("group_messages", {
            keyPath: "id",
            autoIncrement: true,
          });
          groupMessages.createIndex("by-group", "groupId");
        }
        if (!db.objectStoreNames.contains("sender_keys")) {
          db.createObjectStore("sender_keys", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

async function getKv<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return (await db.get("kv", key)) as T | undefined;
}

async function putKv(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put("kv", value, key);
}

async function deleteKvPrefix(prefix: string): Promise<void> {
  const db = await getDb();
  const keys = await db.getAllKeys("kv");
  await Promise.all(
    keys
      .filter((key): key is string => typeof key === "string" && key.startsWith(prefix))
      .map((key) => db.delete("kv", key)),
  );
}

function buffersEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

export class IndexedDbSignalStore implements StorageType {
  getIdentityKeyPair = async (): Promise<KeyPairType<ArrayBuffer> | undefined> => {
    return getKv<KeyPairType<ArrayBuffer>>("signal:identity:keypair");
  };

  getLocalRegistrationId = async (): Promise<number | undefined> => {
    return getKv<number>("signal:registration-id");
  };

  isTrustedIdentity = async (
    identifier: string,
    identityKey: ArrayBuffer,
    _direction: Direction,
  ): Promise<boolean> => {
    const known = await getKv<ArrayBuffer>(`signal:identity:${identifier}`);
    if (!known) {
      return true;
    }
    return buffersEqual(known, identityKey);
  };

  saveIdentity = async (
    encodedAddress: string,
    publicKey: ArrayBuffer,
    _nonblockingApproval?: boolean,
  ): Promise<boolean> => {
    const key = `signal:identity:${encodedAddress}`;
    const existing = await getKv<ArrayBuffer>(key);
    await putKv(key, publicKey);
    return existing ? !buffersEqual(existing, publicKey) : false;
  };

  loadPreKey = async (encodedAddress: string | number): Promise<KeyPairType<ArrayBuffer> | undefined> => {
    return getKv<KeyPairType<ArrayBuffer>>(`signal:prekey:${encodedAddress}`);
  };

  storePreKey = async (keyId: number | string, keyPair: KeyPairType<ArrayBuffer>): Promise<void> => {
    await putKv(`signal:prekey:${keyId}`, keyPair);
  };

  removePreKey = async (keyId: number | string): Promise<void> => {
    const db = await getDb();
    await db.delete("kv", `signal:prekey:${keyId}`);
  };

  storeSession = async (encodedAddress: string, record: SessionRecordType): Promise<void> => {
    await putKv(`signal:session:${encodedAddress}`, record);
  };

  loadSession = async (encodedAddress: string): Promise<SessionRecordType | undefined> => {
    return getKv<SessionRecordType>(`signal:session:${encodedAddress}`);
  };

  loadSignedPreKey = async (keyId: string | number): Promise<KeyPairType<ArrayBuffer> | undefined> => {
    return getKv<KeyPairType<ArrayBuffer>>(`signal:signed-prekey:${keyId}`);
  };

  storeSignedPreKey = async (keyId: string | number, keyPair: KeyPairType<ArrayBuffer>): Promise<void> => {
    await putKv(`signal:signed-prekey:${keyId}`, keyPair);
  };

  removeSignedPreKey = async (keyId: string | number): Promise<void> => {
    const db = await getDb();
    await db.delete("kv", `signal:signed-prekey:${keyId}`);
  };
}

export async function ensureSignalStoreSeeded(identity: LocalIdentity): Promise<IndexedDbSignalStore> {
  const seededUserId = await getKv<string>("signal:seeded-user-id");
  if (seededUserId !== identity.userId) {
    await deleteKvPrefix("signal:");

    const store = new IndexedDbSignalStore();
    await putKv("signal:identity:keypair", {
      pubKey: base64ToArrayBuffer(identity.signalIdentityKeyPair.publicKey),
      privKey: base64ToArrayBuffer(identity.signalIdentityKeyPair.privateKey),
    });
    await putKv("signal:registration-id", identity.signalRegistrationId);

    await store.storeSignedPreKey(identity.signedPreKey.keyId, {
      pubKey: base64ToArrayBuffer(identity.signedPreKey.publicKey),
      privKey: base64ToArrayBuffer(identity.signedPreKey.privateKey),
    });

    await Promise.all(
      identity.oneTimePreKeys.map((preKey) =>
        store.storePreKey(preKey.keyId, {
          pubKey: base64ToArrayBuffer(preKey.publicKey),
          privKey: base64ToArrayBuffer(preKey.privateKey),
        }),
      ),
    );

    await putKv("signal:seeded-user-id", identity.userId);
    return store;
  }

  return new IndexedDbSignalStore();
}

export async function getIdentity(): Promise<LocalIdentity | null> {
  const identity = await getKv<LocalIdentity>("app:identity");
  return identity ?? null;
}

export async function saveIdentity(identity: LocalIdentity): Promise<void> {
  await putKv("app:identity", identity);
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const profile = await getKv<UserProfile>(`app:user-profile:${userId}`);
  return profile ?? null;
}

export async function saveUserProfile(userId: string, profile: UserProfile): Promise<void> {
  await putKv(`app:user-profile:${userId}`, profile);
}

export async function getLastPollAt(): Promise<number> {
  return (await getKv<number>("app:last-poll-at")) ?? 0;
}

export async function saveLastPollAt(timestamp: number): Promise<void> {
  await putKv("app:last-poll-at", timestamp);
}

export async function getGroupLastPollAt(groupId: number): Promise<number> {
  return (await getKv<number>(`app:group-last-poll:${groupId}`)) ?? 0;
}

export async function saveGroupLastPollAt(groupId: number, timestamp: number): Promise<void> {
  await putKv(`app:group-last-poll:${groupId}`, timestamp);
}

export async function listContacts(): Promise<Contact[]> {
  const db = await getDb();
  return db.getAll("contacts");
}

export async function upsertContact(contact: Contact): Promise<void> {
  const db = await getDb();
  await db.put("contacts", contact);
}

export async function getContact(userId: string): Promise<Contact | undefined> {
  const db = await getDb();
  return db.get("contacts", userId);
}

export async function setContactMismatch(userId: string, hasKeyMismatch: boolean): Promise<void> {
  const existing = await getContact(userId);
  if (!existing) {
    return;
  }
  await upsertContact({ ...existing, hasKeyMismatch });
}

export async function addDirectMessage(message: DirectMessage): Promise<void> {
  const db = await getDb();
  await db.add("direct_messages", message);
}

type DirectMessagePatch = Partial<
  Pick<
    DirectMessage,
    | "body"
    | "kind"
    | "editedAt"
    | "isDeletedForEveryone"
    | "isPinned"
    | "replyToClientMsgId"
    | "replyToText"
    | "replyToSender"
    | "attachments"
    | "reactions"
  >
>;

function normalizeMessageReactions(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalized: Record<string, string[]> = {};
  for (const [emoji, rawUsers] of Object.entries(value)) {
    if (typeof emoji !== "string" || !emoji.trim()) {
      continue;
    }

    if (!Array.isArray(rawUsers)) {
      continue;
    }

    const users = Array.from(
      new Set(
        rawUsers
          .map((userId) => (typeof userId === "string" ? userId.trim() : ""))
          .filter((userId) => userId.length > 0),
      ),
    );

    if (users.length > 0) {
      normalized[emoji.trim().slice(0, 24)] = users;
    }
  }

  return normalized;
}

function findDirectMessageByClientId(peerUserId: string, clientMsgId: string, rows: DirectMessage[]): DirectMessage | undefined {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!row || row.peerUserId !== peerUserId || row.clientMsgId !== clientMsgId) {
      continue;
    }
    return row;
  }

  return undefined;
}

function makeReactionMapMutation(
  existing: DirectMessage["reactions"] | undefined,
  emoji: string,
  userId: string,
  isAdded: boolean,
): Record<string, string[]> {
  const nextReactions = normalizeMessageReactions(existing);
  const nextUsers = new Set(nextReactions[emoji] ?? []);

  if (isAdded) {
    nextUsers.add(userId);
  } else {
    nextUsers.delete(userId);
  }

  if (nextUsers.size === 0) {
    delete nextReactions[emoji];
  } else {
    nextReactions[emoji] = Array.from(nextUsers);
  }

  return nextReactions;
}

async function updateDirectMessageByClientId(
  peerUserId: string,
  clientMsgId: string,
  patch: DirectMessagePatch,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("direct_messages", "by-peer", peerUserId);
  const existing = findDirectMessageByClientId(peerUserId, clientMsgId, rows);

  if (!existing?.id) {
    return false;
  }

  await db.put("direct_messages", {
    ...existing,
    ...patch,
    peerUserId,
    id: existing.id,
    reactions: patch.reactions
      ? normalizeMessageReactions(patch.reactions)
      : existing.reactions
        ? normalizeMessageReactions(existing.reactions)
        : undefined,
  });
  return true;
}

export async function updateDirectMessageByClientMsgId(
  peerUserId: string,
  clientMsgId: string,
  patch: DirectMessagePatch,
): Promise<boolean> {
  return updateDirectMessageByClientId(peerUserId, clientMsgId, patch);
}

export async function setDirectMessageReaction(args: {
  peerUserId: string;
  clientMsgId: string;
  emoji: string;
  userId: string;
  isAdded: boolean;
}): Promise<boolean> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("direct_messages", "by-peer", args.peerUserId);
  const existing = findDirectMessageByClientId(args.peerUserId, args.clientMsgId, rows);

  if (!existing?.id) {
    return false;
  }

  const emoji = args.emoji.trim().slice(0, 24);
  const userId = args.userId.trim();
  if (!emoji || !userId) {
    return false;
  }

  await db.put("direct_messages", {
    ...existing,
    id: existing.id,
    reactions: makeReactionMapMutation(existing.reactions, emoji, userId, args.isAdded),
  });

  return true;
}

export async function deleteDirectMessages(peerUserId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("direct_messages", "by-peer", peerUserId);
  await Promise.all(
    rows.map((row) => {
      if (row.id === undefined) {
        return Promise.resolve();
      }
      return db.delete("direct_messages", row.id);
    }),
  );
}

export async function deleteDirectMessagesByIds(ids: number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const db = await getDb();
  const uniqueIds = Array.from(new Set(ids.filter((value): value is number => Number.isFinite(value))));
  await Promise.all(uniqueIds.map((id) => db.delete("direct_messages", id)));
}

export async function listDirectMessages(peerUserId: string): Promise<DirectMessage[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("direct_messages", "by-peer", peerUserId);
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function listGroups(): Promise<GroupInfo[]> {
  const db = await getDb();
  const rows = await db.getAll("groups");
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function upsertGroups(groupsToSave: GroupInfo[]): Promise<void> {
  const db = await getDb();
  await Promise.all(groupsToSave.map((group) => db.put("groups", group)));
}

export async function addGroupMessage(message: GroupMessage): Promise<void> {
  const db = await getDb();
  await db.add("group_messages", message);
}

type GroupMessagePatch = Partial<
  Pick<
    GroupMessage,
    | "body"
    | "kind"
    | "editedAt"
    | "isDeletedForEveryone"
    | "isPinned"
    | "replyToClientMsgId"
    | "replyToText"
    | "replyToSender"
    | "attachments"
    | "reactions"
  >
>;

function findGroupMessageByClientId(groupId: number, clientMsgId: string, rows: GroupMessage[]): GroupMessage | undefined {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!row || row.groupId !== groupId || row.clientMsgId !== clientMsgId) {
      continue;
    }
    return row;
  }

  return undefined;
}

async function updateGroupMessageByClientId(
  groupId: number,
  clientMsgId: string,
  patch: GroupMessagePatch,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("group_messages", "by-group", groupId);
  const existing = findGroupMessageByClientId(groupId, clientMsgId, rows);

  if (!existing?.id) {
    return false;
  }

  await db.put("group_messages", {
    ...existing,
    ...patch,
    groupId,
    id: existing.id,
    reactions: patch.reactions
      ? normalizeMessageReactions(patch.reactions)
      : existing.reactions
        ? normalizeMessageReactions(existing.reactions)
        : undefined,
  });
  return true;
}

export async function updateGroupMessageByClientMsgId(
  groupId: number,
  clientMsgId: string,
  patch: GroupMessagePatch,
): Promise<boolean> {
  return updateGroupMessageByClientId(groupId, clientMsgId, patch);
}

export async function setGroupMessageReaction(args: {
  groupId: number;
  clientMsgId: string;
  emoji: string;
  userId: string;
  isAdded: boolean;
}): Promise<boolean> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("group_messages", "by-group", args.groupId);
  const existing = findGroupMessageByClientId(args.groupId, args.clientMsgId, rows);

  if (!existing?.id) {
    return false;
  }

  const emoji = args.emoji.trim().slice(0, 24);
  const userId = args.userId.trim();
  if (!emoji || !userId) {
    return false;
  }

  await db.put("group_messages", {
    ...existing,
    id: existing.id,
    reactions: makeReactionMapMutation(existing.reactions, emoji, userId, args.isAdded),
  });
  return true;
}

export async function deleteGroupMessages(groupId: number): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("group_messages", "by-group", groupId);
  await Promise.all(
    rows.map((row) => {
      if (row.id === undefined) {
        return Promise.resolve();
      }
      return db.delete("group_messages", row.id);
    }),
  );
}

export async function deleteGroupMessagesByIds(ids: number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const db = await getDb();
  const uniqueIds = Array.from(new Set(ids.filter((value): value is number => Number.isFinite(value))));
  await Promise.all(uniqueIds.map((id) => db.delete("group_messages", id)));
}

export async function listGroupMessages(groupId: number): Promise<GroupMessage[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("group_messages", "by-group", groupId);
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function upsertSenderKey(args: {
  groupId: number;
  senderUserId: string;
  senderKeyId: number;
  keyMaterial: string;
}): Promise<void> {
  const db = await getDb();
  await db.put("sender_keys", {
    id: `${args.groupId}:${args.senderUserId}`,
    groupId: args.groupId,
    senderUserId: args.senderUserId,
    senderKeyId: args.senderKeyId,
    keyMaterial: args.keyMaterial,
    createdAt: Date.now(),
  });
}

export async function getSenderKey(groupId: number, senderUserId: string): Promise<SenderKey | undefined> {
  const db = await getDb();
  return db.get("sender_keys", `${groupId}:${senderUserId}`);
}
