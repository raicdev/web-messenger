"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessengerSetup, MessengerShell } from "@/components/messenger/ui";
import {
  createLocalIdentity,
  randomNonce,
  restoreLocalIdentity,
  signProcedure,
  type LocalIdentity,
} from "@/lib/crypto";
import {
  createSafetyNumber,
  createSenderKey,
  decryptDirectPayload,
  decryptWithSenderKey,
  DEVICE_ID,
  encryptDirectPayload,
  encryptWithSenderKey,
  ensureSession,
  hasOpenSession,
  type SignalBundle,
} from "@/lib/signal";
import {
  MAX_ATTACHMENT_COUNT,
  MAX_EACH_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  sanitizeMessageAttachments,
} from "@/lib/attachment";
import { arrayBufferToBase64 } from "@/lib/encoding";
import {
  addDirectMessage,
  addGroupMessage,
  deleteDirectMessages,
  deleteDirectMessagesByIds,
  deleteGroupMessages,
  deleteGroupMessagesByIds,
  setDirectMessageReaction,
  setGroupMessageReaction,
  ensureSignalStoreSeeded,
  getContact,
  getGroupLastPollAt,
  getIdentity,
  getLastPollAt,
  getUserProfile,
  getSenderKey,
  listContacts,
  listDirectMessages,
  listGroupMessages,
  listGroups,
  updateDirectMessageByClientMsgId,
  updateGroupMessageByClientMsgId,
  saveGroupLastPollAt,
  saveIdentity,
  saveLastPollAt,
  saveUserProfile,
  upsertContact,
  upsertGroups,
  upsertSenderKey,
  type Contact,
  type DirectMessage,
  type MessageAttachment,
  type GroupInfo,
  type GroupMessage,
  type UserProfile,
} from "@/lib/storage";
import { trpc } from "@/lib/trpc";

type DirectPayload =
  | {
      kind: "dm_text";
      text: string;
      replyToClientMsgId?: string;
      replyToText?: string;
      replyToSender?: string;
      senderName?: string;
      senderHandle?: string;
    }
  | {
      kind: "dm_media";
      text?: string;
      attachments: MessageAttachment[];
      replyToClientMsgId?: string;
      replyToText?: string;
      replyToSender?: string;
      senderName?: string;
      senderHandle?: string;
    }
  | {
      kind: "sender_key_distribution";
      groupId: number;
      senderUserId: string;
      senderKeyId: number;
      senderKey: string;
    }
  | {
      kind: "dm_edit";
      targetClientMsgId: string;
      text: string;
    }
  | {
      kind: "dm_delete";
      targetClientMsgId: string;
      deleteForEveryone: true;
    }
  | {
      kind: "dm_reaction";
      targetClientMsgId: string;
      emoji: string;
      isAdded: boolean;
    }
  | {
      kind: "dm_pin";
      targetClientMsgId: string;
      pinned: boolean;
    };

type GroupPayload =
  | {
      kind: "group_text";
      text: string;
      replyToClientMsgId?: string;
      replyToText?: string;
      replyToSender?: string;
    }
  | {
      kind: "group_media";
      text?: string;
      attachments: MessageAttachment[];
      replyToClientMsgId?: string;
      replyToText?: string;
      replyToSender?: string;
    }
  | {
      kind: "group_edit";
      targetClientMsgId: string;
      text: string;
    }
  | {
      kind: "group_delete";
      targetClientMsgId: string;
      deleteForEveryone: true;
    }
  | {
      kind: "group_reaction";
      targetClientMsgId: string;
      emoji: string;
      isAdded: boolean;
    }
  | {
      kind: "group_pin";
      targetClientMsgId: string;
      pinned: boolean;
    };

function parseDirectPayload(text: string): DirectPayload | null {
  try {
    return JSON.parse(text) as DirectPayload;
  } catch {
    return null;
  }
}

function parseGroupPayload(text: string): GroupPayload | null {
  try {
    return JSON.parse(text) as GroupPayload;
  } catch {
    return null;
  }
}

function buildMessagePreview(text: string, kind?: "text" | "media", attachments?: MessageAttachment[]): string {
  const clean = text.trim();
  if (kind === "media") {
    const attachmentCount = attachments?.length ?? 0;
    const suffix = attachmentCount > 0 ? ` (${attachmentCount} file${attachmentCount === 1 ? "" : "s"})` : "";
    if (clean) {
      return `${clean}${suffix}`;
    }

    return `📎 Attachment${suffix}`;
  }

  return clean || "No messages yet";
}

function formatMessageAttachmentsTotal(attachments: MessageAttachment[]): number {
  return attachments.reduce((total, attachment) => total + attachment.size, 0);
}

async function buildAttachmentPayload(file: File): Promise<MessageAttachment> {
  if (file.size > MAX_EACH_ATTACHMENT_BYTES) {
    throw new Error(`Attachment too large: ${file.name}`);
  }

  const buffer = await file.arrayBuffer();
  return {
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    dataBase64: arrayBufferToBase64(buffer),
  };
}

function sanitizeMessageText(payloadText: string | undefined): string {
  return payloadText ? payloadText.trim().slice(0, 3200) : "";
}

function sanitizeReactionEmoji(value: string | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, 32);
}

function sanitizeReplyMetaText(payloadText: string | undefined, maxLength = 180): string {
  const clean = payloadText ? payloadText.trim() : "";
  return clean.slice(0, maxLength);
}

function sanitizeReplyMetaId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const clean = value.trim();
  if (!clean) {
    return undefined;
  }
  return clean.slice(0, 96);
}

function parseUserIds(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,\n]+/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function createClientMsgId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getClientErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return "request failed";
  }

  const raw = String(error.message ?? "").trim();
  if (!raw) {
    return "request failed";
  }

  if (raw.includes("insert into \"message_queue\"")) {
    return "failed to send message (server rejected encrypted payload)";
  }

  const firstLine = raw.split("\n")[0] ?? raw;
  return firstLine.slice(0, 180);
}

const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;
const TELEGRAM_DELETED_TEXT = "This message was deleted";

function sanitizeHandle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

function defaultProfileForUser(userId: string): UserProfile {
  const fallbackHandle = sanitizeHandle(`user_${userId.slice(0, 8)}`);
  return {
    displayName: `User ${userId.slice(0, 8)}`,
    handle: fallbackHandle.length >= 3 ? fallbackHandle : "user_0000",
    about: "",
    updatedAt: Date.now(),
  };
}

function normalizeProfile(profile: UserProfile | null, userId: string): UserProfile {
  const fallback = defaultProfileForUser(userId);
  if (!profile) {
    return fallback;
  }

  const cleanedHandle = sanitizeHandle(profile.handle);
  return {
    displayName: profile.displayName.trim() || fallback.displayName,
    handle: HANDLE_PATTERN.test(cleanedHandle) ? cleanedHandle : fallback.handle,
    about: profile.about.trim().slice(0, 160),
    updatedAt: profile.updatedAt || Date.now(),
  };
}

function defaultContactDisplayName(userId: string): string {
  return `User ${userId.slice(0, 8)}`;
}

function defaultContactHandle(userId: string): string {
  const fallback = sanitizeHandle(`user_${userId.slice(0, 8)}`);
  return HANDLE_PATTERN.test(fallback) ? fallback : "user_chat";
}

function resolveContactDisplayName(userId: string, incomingName?: string, existingName?: string): string {
  const nextName = incomingName?.trim().slice(0, 40);
  if (nextName) {
    return nextName;
  }

  const knownName = existingName?.trim().slice(0, 40);
  if (knownName) {
    return knownName;
  }

  return defaultContactDisplayName(userId);
}

function resolveContactHandle(userId: string, incomingHandle?: string, existingHandle?: string): string {
  const nextHandle = sanitizeHandle(incomingHandle ?? "");
  if (HANDLE_PATTERN.test(nextHandle)) {
    return nextHandle;
  }

  const knownHandle = sanitizeHandle(existingHandle ?? "");
  if (HANDLE_PATTERN.test(knownHandle)) {
    return knownHandle;
  }

  return defaultContactHandle(userId);
}

export default function Page() {
  const [identity, setIdentity] = useState<LocalIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Add loading state
  const [recovery, setRecovery] = useState<string>("");

  const [importRecovery, setImportRecovery] = useState<string>("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [activeView, setActiveView] = useState<"direct" | "group">("direct");
  const [selectedPeerUserId, setSelectedPeerUserId] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [contactInput, setContactInput] = useState<string>("");
  const [messageInput, setMessageInput] = useState<string>("");
  const [groupNameInput, setGroupNameInput] = useState<string>("");
  const [groupMembersInput, setGroupMembersInput] = useState<string>("");
  const [addMembersInput, setAddMembersInput] = useState<string>("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [safetyNumber, setSafetyNumber] = useState<string>("");
  const [status, setStatus] = useState<string>("idle");
  const [directMessagePreviews, setDirectMessagePreviews] = useState<Record<string, string>>({});
  const [groupMessagePreviews, setGroupMessagePreviews] = useState<Record<number, string>>({});

  const refreshContacts = useCallback(async () => {
    const rows = await listContacts();
    const enriched = await Promise.all(
      rows.map(async (contact) => {
        const messages = await listDirectMessages(contact.userId);
        const latest = messages[messages.length - 1];
        const preview = latest ? buildMessagePreview(latest.body, latest.kind, latest.attachments) : "No messages yet";
        return {
          contact,
          preview,
          latestAt: latest?.createdAt ?? contact.addedAt,
        };
      }),
    );

    const sortedContacts = enriched.sort((a, b) => b.latestAt - a.latestAt).map((entry) => entry.contact);
    setContacts(sortedContacts);
    setDirectMessagePreviews(
      enriched.reduce<Record<string, string>>((acc, entry) => {
        acc[entry.contact.userId] = entry.preview;
        return acc;
      }, {}),
    );
  }, []);

  const refreshGroups = useCallback(async () => {
    const rows = await listGroups();
    const enriched = await Promise.all(
      rows.map(async (group) => {
        const messages = await listGroupMessages(group.groupId);
        const latest = messages[messages.length - 1];
        const preview = latest ? buildMessagePreview(latest.body, latest.kind, latest.attachments) : "No messages yet";
        return {
          group,
          preview,
          latestAt: latest?.createdAt ?? group.createdAt,
        };
      }),
    );

    const sortedGroups = enriched.sort((a, b) => b.latestAt - a.latestAt).map((entry) => entry.group);
    setGroups(sortedGroups);
    setGroupMessagePreviews(
      enriched.reduce<Record<number, string>>((acc, entry) => {
        acc[entry.group.groupId] = entry.preview;
        return acc;
      }, {}),
    );
  }, []);

  const refreshDirect = useCallback(async (peerUserId: string) => {
    if (!peerUserId) {
      setDirectMessages([]);
      return;
    }
    setDirectMessages(await listDirectMessages(peerUserId));
  }, []);

  const refreshGroup = useCallback(async (groupId: number | null) => {
    if (!groupId) {
      setGroupMessages([]);
      return;
    }
    setGroupMessages(await listGroupMessages(groupId));
  }, []);

  const updateDirectMessagePreview = useCallback(async (peerUserId: string) => {
    const latestRows = await listDirectMessages(peerUserId);
    const latest = latestRows[latestRows.length - 1];
    const preview = latest ? buildMessagePreview(latest.body, latest.kind, latest.attachments) : "No messages yet";
    setDirectMessagePreviews((current) => ({ ...current, [peerUserId]: preview }));
  }, []);

  const updateGroupMessagePreview = useCallback(async (groupId: number) => {
    const latestRows = await listGroupMessages(groupId);
    const latest = latestRows[latestRows.length - 1];
    const preview = latest ? buildMessagePreview(latest.body, latest.kind, latest.attachments) : "No messages yet";
    setGroupMessagePreviews((current) => ({ ...current, [groupId]: preview }));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const savedIdentity = await getIdentity();
        setIdentity(savedIdentity);
        if (savedIdentity) {
          const storedProfile = await getUserProfile(savedIdentity.userId);
          const nextProfile = normalizeProfile(storedProfile, savedIdentity.userId);
          setProfile(nextProfile);

          if (
            !storedProfile ||
            storedProfile.displayName !== nextProfile.displayName ||
            storedProfile.handle !== nextProfile.handle ||
            storedProfile.about !== nextProfile.about
          ) {
            await saveUserProfile(savedIdentity.userId, nextProfile);
          }
        } else {
          setProfile(null);
        }
        await Promise.all([refreshContacts(), refreshGroups()]);

        const loadedContacts = await listContacts();
        if (loadedContacts[0]) {
          setSelectedPeerUserId(loadedContacts[0].userId);
        }
        const loadedGroups = await listGroups();
        if (loadedGroups[0]) {
          setSelectedGroupId(loadedGroups[0].groupId);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshContacts, refreshGroups]);

  useEffect(() => {
    if (!identity) {
      return;
    }
    void ensureSignalStoreSeeded(identity);
  }, [identity]);

  useEffect(() => {
    if (activeView === "direct") {
      void refreshDirect(selectedPeerUserId);
    }
  }, [activeView, refreshDirect, selectedPeerUserId]);

  useEffect(() => {
    if (activeView === "group") {
      void refreshGroup(selectedGroupId);
    }
  }, [activeView, refreshGroup, selectedGroupId]);

  const makeAuth = useCallback(
    async (procedure: string, payload: Record<string, unknown>) => {
      if (!identity) {
        throw new Error("identity not ready");
      }

      const nonce = randomNonce();
      const signature = await signProcedure(procedure, payload, nonce, identity);
      return {
        userId: identity.userId,
        identityPublicKey: identity.authIdentityPublicKey,
        nonce,
        signature,
      };
    },
    [identity],
  );

  const registerBundle = useCallback(
    async (nextIdentity: LocalIdentity) => {
      const payload = {
        signalIdentityPublicKey: nextIdentity.signalIdentityKeyPair.publicKey,
        registrationId: nextIdentity.signalRegistrationId,
        signedPreKey: {
          keyId: nextIdentity.signedPreKey.keyId,
          publicKey: nextIdentity.signedPreKey.publicKey,
          signature: nextIdentity.signedPreKey.signature,
        },
        oneTimePreKeys: nextIdentity.oneTimePreKeys.map((preKey) => ({
          keyId: preKey.keyId,
          publicKey: preKey.publicKey,
        })),
      };
      const nonce = randomNonce();

      await trpc.identity.registerBundle.mutate({
        ...payload,
        auth: {
          userId: nextIdentity.userId,
          identityPublicKey: nextIdentity.authIdentityPublicKey,
          nonce,
          signature: await signProcedure("identity.registerBundle", payload, nonce, nextIdentity),
        },
      });
    },
    [],
  );

  const sendDirectPayload = useCallback(
    async (toUserId: string, payload: DirectPayload, clientMsgId = createClientMsgId()): Promise<void> => {
      if (!identity) {
        return;
      }

      const signalStore = await ensureSignalStoreSeeded(identity);
      let sessionOpen = await hasOpenSession(signalStore, toUserId);

      if (!sessionOpen) {
        const bundle = (await trpc.identity.getBundle.query({ userId: toUserId })) as SignalBundle;
        const existing = await getContact(toUserId);
        const hasMismatch = existing?.signalIdentityPublicKey
          ? existing.signalIdentityPublicKey !== bundle.signalIdentityPublicKey
          : false;

        await upsertContact({
          userId: toUserId,
          signalIdentityPublicKey: bundle.signalIdentityPublicKey,
          hasKeyMismatch: hasMismatch,
          addedAt: existing?.addedAt ?? Date.now(),
          displayName: resolveContactDisplayName(toUserId, undefined, existing?.displayName),
          handle: resolveContactHandle(toUserId, undefined, existing?.handle),
        });

        if (hasMismatch) {
          setStatus(`warning: ${toUserId} のidentity keyが変更されています`);
        }

        await ensureSession(signalStore, toUserId, bundle);
        sessionOpen = true;
      }

      if (!sessionOpen) {
        throw new Error("unable to establish session");
      }

      const encrypted = await encryptDirectPayload(signalStore, toUserId, JSON.stringify(payload));
      const sendPayload = {
        toUserId,
        ciphertext: encrypted.ciphertext,
        header: encrypted.header,
        clientMsgId,
        createdAt: Date.now(),
      };

      await trpc.message.send.mutate({
        ...sendPayload,
        auth: await makeAuth("message.send", sendPayload),
      });
    },
    [identity, makeAuth],
  );

  const ensureMySenderKey = useCallback(
    async (groupId: number, memberUserIds: string[]) => {
      if (!identity) {
        return null;
      }

      let senderKey = await getSenderKey(groupId, identity.userId);
      if (!senderKey) {
        const created = createSenderKey();
        await upsertSenderKey({
          groupId,
          senderUserId: identity.userId,
          senderKeyId: created.keyId,
          keyMaterial: created.keyMaterial,
        });

        senderKey = await getSenderKey(groupId, identity.userId);
      }

      if (!senderKey) {
        return null;
      }

      await Promise.all(
        memberUserIds
          .filter((memberUserId) => memberUserId !== identity.userId)
          .map((memberUserId) =>
            sendDirectPayload(memberUserId, {
              kind: "sender_key_distribution",
              groupId,
              senderUserId: identity.userId,
              senderKeyId: senderKey.senderKeyId,
              senderKey: senderKey.keyMaterial,
            }),
          ),
      );

      return senderKey;
    },
    [identity, sendDirectPayload],
  );

  const loadSafetyNumber = useCallback(async () => {
    if (!identity || !selectedPeerUserId) {
      setSafetyNumber("");
      return;
    }

    const contact = await getContact(selectedPeerUserId);
    if (!contact?.signalIdentityPublicKey) {
      setSafetyNumber("");
      return;
    }

    setSafetyNumber(
      await createSafetyNumber(
        identity.userId,
        identity.signalIdentityKeyPair.publicKey,
        selectedPeerUserId,
        contact.signalIdentityPublicKey,
      ),
    );
  }, [identity, selectedPeerUserId]);

  useEffect(() => {
    if (activeView !== "direct") {
      return;
    }
    void loadSafetyNumber();
  }, [activeView, loadSafetyNumber]);

  const handleCreateIdentity = useCallback(async () => {
    setStatus("creating identity...");
    const created = await createLocalIdentity();
    await registerBundle(created.identity);
    await saveIdentity(created.identity);
    await ensureSignalStoreSeeded(created.identity);
    const initialProfile = defaultProfileForUser(created.identity.userId);
    await saveUserProfile(created.identity.userId, initialProfile);
    setIdentity(created.identity);
    setProfile(initialProfile);
    setRecovery(created.recovery);
    setStatus("identity ready");
  }, [registerBundle]);

  const handleImportIdentity = useCallback(async () => {
    setStatus("restoring identity...");
    const restored = await restoreLocalIdentity(importRecovery.trim());
    await registerBundle(restored);
    await saveIdentity(restored);
    await ensureSignalStoreSeeded(restored);
    const storedProfile = await getUserProfile(restored.userId);
    const nextProfile = normalizeProfile(storedProfile, restored.userId);
    await saveUserProfile(restored.userId, nextProfile);
    setIdentity(restored);
    setProfile(nextProfile);
    setStatus("identity restored");
  }, [importRecovery, registerBundle]);

  const handleSaveProfile = useCallback(
    async (nextProfile: Pick<UserProfile, "displayName" | "handle" | "about">) => {
      if (!identity) {
        return { ok: false as const, error: "identity not ready" };
      }

      const displayName = nextProfile.displayName.trim().slice(0, 40);
      const handle = sanitizeHandle(nextProfile.handle);
      const about = nextProfile.about.trim().slice(0, 160);

      if (!displayName) {
        return { ok: false as const, error: "display name is required" };
      }

      if (!HANDLE_PATTERN.test(handle)) {
        return {
          ok: false as const,
          error: "handle must be 3-24 chars and use only a-z, 0-9, _",
        };
      }

      const normalized: UserProfile = {
        displayName,
        handle,
        about,
        updatedAt: Date.now(),
      };

      try {
        await saveUserProfile(identity.userId, normalized);
        setProfile(normalized);
        setStatus("profile updated");
        return { ok: true as const };
      } catch (error) {
        const message = getClientErrorMessage(error);
        setStatus(`error: ${message}`);
        return { ok: false as const, error: message };
      }
    },
    [identity],
  );

  const handleAddContact = useCallback(async () => {
    if (!identity || !contactInput.trim()) {
      return;
    }

    const userId = contactInput.trim();
    const existing = await getContact(userId);

    if (existing) {
      setSelectedPeerUserId(userId);
      setActiveView("direct");
      setContactInput("");
      await refreshContacts();
      await refreshDirect(userId);
      await loadSafetyNumber();
      setStatus("contact already added");
      return;
    }

    setStatus("adding contact...");

    try {
      const bundle = (await trpc.identity.getBundle.query({ userId })) as SignalBundle;
      const hasKeyMismatch = false;

      await upsertContact({
        userId,
        signalIdentityPublicKey: bundle.signalIdentityPublicKey,
        hasKeyMismatch,
        addedAt: Date.now(),
        displayName: resolveContactDisplayName(userId, undefined, undefined),
        handle: resolveContactHandle(userId, undefined, undefined),
      });

      // Show the contact in sidebar even if session bootstrap fails.
      await refreshContacts();

      try {
        const signalStore = await ensureSignalStoreSeeded(identity);
        await ensureSession(signalStore, userId, bundle);
      } catch (error) {
        const message = getClientErrorMessage(error);
        setStatus(`warning: contact added, session pending (${message})`);
      }

      setContactInput("");
      setSelectedPeerUserId(userId);
      setActiveView("direct");
      await refreshDirect(userId);
      await loadSafetyNumber();
      setStatus((current) =>
        current.startsWith("warning:") ? current : "contact added",
      );
    } catch (error) {
      const message = getClientErrorMessage(error);
      setStatus(`error: ${message}`);
    }
  }, [contactInput, identity, loadSafetyNumber, refreshContacts, refreshDirect]);

  const handleSend = useCallback(
    async (
      incomingAttachments: File[],
      replyContext?: {
        clientMsgId?: string;
        text?: string;
        sender?: string;
      },
    ): Promise<void> => {
      const cleanedText = sanitizeMessageText(messageInput);
      const hasMessage = cleanedText.length > 0;
      const attachments = incomingAttachments.filter((attachment) => attachment.size > 0);
      const hasAttachments = attachments.length > 0;
      const hasActiveChat = activeView === "direct" ? Boolean(selectedPeerUserId) : Boolean(selectedGroupId);
      const replyToClientMsgId = sanitizeReplyMetaId(replyContext?.clientMsgId);
      const replyToText = sanitizeReplyMetaText(replyContext?.text);
      const replyToSender = sanitizeReplyMetaText(replyContext?.sender, 64);

      if (!identity || !hasActiveChat || !hasMessage && !hasAttachments) {
        return;
      }

      if (attachments.length > MAX_ATTACHMENT_COUNT) {
        throw new Error(`Too many attachments. Maximum is ${MAX_ATTACHMENT_COUNT}.`);
      }

      const payloadAttachments = hasAttachments ? await Promise.all(attachments.map(buildAttachmentPayload)) : [];
      if (payloadAttachments.length > 0) {
        const totalSize = formatMessageAttachmentsTotal(payloadAttachments);
        if (totalSize > MAX_TOTAL_ATTACHMENT_BYTES) {
          throw new Error("Total attachment size is too large.");
        }
      }

      const replyPayload = {
        ...(replyToClientMsgId ? { replyToClientMsgId } : {}),
        ...(replyToText ? { replyToText } : {}),
        ...(replyToSender ? { replyToSender } : {}),
      };
      const clientMsgId = createClientMsgId();

      if (activeView === "direct") {
        const senderName = (profile?.displayName ?? defaultProfileForUser(identity.userId).displayName)
          .trim()
          .slice(0, 40);
        const senderHandle = resolveContactHandle(
          identity.userId,
          profile?.handle,
          defaultProfileForUser(identity.userId).handle,
        );

        if (payloadAttachments.length > 0) {
          await sendDirectPayload(selectedPeerUserId, {
            kind: "dm_media",
            text: hasMessage ? cleanedText : undefined,
            attachments: payloadAttachments,
            ...replyPayload,
            senderName,
            senderHandle,
          }, clientMsgId);
        } else {
          await sendDirectPayload(selectedPeerUserId, {
            kind: "dm_text",
            text: cleanedText,
            ...replyPayload,
            senderName,
            senderHandle,
          }, clientMsgId);
        }

        await addDirectMessage({
          clientMsgId,
          peerUserId: selectedPeerUserId,
          direction: "out",
          body: cleanedText,
          kind: payloadAttachments.length > 0 ? "media" : "text",
          replyToClientMsgId,
          replyToText,
          replyToSender,
          attachments: payloadAttachments.length > 0 ? payloadAttachments : undefined,
          createdAt: Date.now(),
        });
        await updateDirectMessagePreview(selectedPeerUserId);
        setMessageInput("");
        await refreshDirect(selectedPeerUserId);
        return;
      }

      if (!selectedGroupId) {
        return;
      }

      const members = await trpc.group.getMembers.query({
        groupId: selectedGroupId,
        auth: await makeAuth("group.getMembers", { groupId: selectedGroupId }),
      });

      const senderKey = await ensureMySenderKey(
        selectedGroupId,
        members.map((member) => member.userId),
      );

      if (!senderKey) {
        throw new Error("sender key is not available");
      }

      const groupPayload: GroupPayload =
        payloadAttachments.length > 0
          ? {
              kind: "group_media",
              text: hasMessage ? cleanedText : undefined,
              attachments: payloadAttachments,
              ...replyPayload,
            }
          : {
              kind: "group_text",
              text: cleanedText,
              ...replyPayload,
            };

      const encrypted = await encryptWithSenderKey(
        senderKey.keyMaterial,
        JSON.stringify(groupPayload),
        senderKey.senderKeyId,
      );
      const postPayload = {
        groupId: selectedGroupId,
        ciphertext: encrypted.ciphertext,
        header: encrypted.header,
        clientMsgId,
        createdAt: Date.now(),
      };

      await trpc.group.post.mutate({
        ...postPayload,
        auth: await makeAuth("group.post", postPayload),
      });

      await addGroupMessage({
          clientMsgId,
        groupId: selectedGroupId,
        fromUserId: identity.userId,
        body: cleanedText,
        kind: payloadAttachments.length > 0 ? "media" : "text",
        replyToClientMsgId,
        replyToText,
        replyToSender,
        attachments: payloadAttachments.length > 0 ? payloadAttachments : undefined,
        createdAt: postPayload.createdAt,
      });

      await updateGroupMessagePreview(selectedGroupId);
      setMessageInput("");
      await refreshGroup(selectedGroupId);
    },
    [
      activeView,
      ensureMySenderKey,
      identity,
      makeAuth,
      messageInput,
      profile,
      refreshDirect,
      refreshGroup,
      selectedGroupId,
      selectedPeerUserId,
      sendDirectPayload,
      updateDirectMessagePreview,
      updateGroupMessagePreview,
    ],
  );

  const handleSendWithClientError = useCallback(
    async (
      incomingAttachments: File[],
      replyContext?: { clientMsgId?: string; text?: string; sender?: string },
    ): Promise<boolean> => {
      try {
        await handleSend(incomingAttachments, replyContext);
        return true;
      } catch (error) {
        const message = getClientErrorMessage(error);
        setStatus(`error: ${message}`);
        return false;
      }
    },
    [handleSend],
  );

  const handleEditMessage = useCallback(
    async (targetClientMsgIdRaw: string, nextText: string): Promise<boolean> => {
      if (!identity || !nextText.trim()) {
        return false;
      }

      const targetClientMsgId = sanitizeReplyMetaId(targetClientMsgIdRaw);
      const nextBody = sanitizeMessageText(nextText);
      if (!targetClientMsgId || !nextBody) {
        return false;
      }

      const editedAt = Date.now();

      if (activeView === "direct") {
        if (!selectedPeerUserId) {
          return false;
        }

        await updateDirectMessageByClientMsgId(selectedPeerUserId, targetClientMsgId, {
          body: nextBody,
          editedAt,
        });
        await sendDirectPayload(selectedPeerUserId, {
          kind: "dm_edit",
          targetClientMsgId,
          text: nextBody,
        });
        await refreshDirect(selectedPeerUserId);
        return true;
      }

      if (!selectedGroupId) {
        return false;
      }

      const members = await trpc.group.getMembers.query({
        groupId: selectedGroupId,
        auth: await makeAuth("group.getMembers", { groupId: selectedGroupId }),
      });

      const senderKey = await ensureMySenderKey(
        selectedGroupId,
        members.map((member) => member.userId),
      );

      if (!senderKey) {
        throw new Error("sender key is not available");
      }

      await updateGroupMessageByClientMsgId(selectedGroupId, targetClientMsgId, {
        body: nextBody,
        editedAt,
      });

      const encrypted = await encryptWithSenderKey(
        senderKey.keyMaterial,
        JSON.stringify({
          kind: "group_edit",
          targetClientMsgId,
          text: nextBody,
        } satisfies GroupPayload),
        senderKey.senderKeyId,
      );

      const payload = {
        groupId: selectedGroupId,
        ciphertext: encrypted.ciphertext,
        header: encrypted.header,
        clientMsgId: createClientMsgId(),
        createdAt: editedAt,
      };

      await trpc.group.post.mutate({
        ...payload,
        auth: await makeAuth("group.post", payload),
      });

      await refreshGroup(selectedGroupId);
      return true;
    },
    [
      activeView,
      ensureMySenderKey,
      identity,
      makeAuth,
      refreshDirect,
      refreshGroup,
      selectedGroupId,
      selectedPeerUserId,
      sendDirectPayload,
    ],
  );

  const handleDeleteForEveryone = useCallback(
    async (targetClientMsgIdRaw: string): Promise<boolean> => {
      if (!identity) {
        return false;
      }

      const targetClientMsgId = sanitizeReplyMetaId(targetClientMsgIdRaw);
      if (!targetClientMsgId) {
        return false;
      }

      const deletionPatch = {
        body: TELEGRAM_DELETED_TEXT,
        editedAt: Date.now(),
        isDeletedForEveryone: true,
        kind: "text" as const,
        attachments: undefined,
      };

      if (activeView === "direct") {
        if (!selectedPeerUserId) {
          return false;
        }

        await updateDirectMessageByClientMsgId(selectedPeerUserId, targetClientMsgId, deletionPatch);
        await sendDirectPayload(selectedPeerUserId, {
          kind: "dm_delete",
          targetClientMsgId,
          deleteForEveryone: true,
        });
        await refreshDirect(selectedPeerUserId);
        return true;
      }

      if (!selectedGroupId) {
        return false;
      }

      const members = await trpc.group.getMembers.query({
        groupId: selectedGroupId,
        auth: await makeAuth("group.getMembers", { groupId: selectedGroupId }),
      });

      const senderKey = await ensureMySenderKey(
        selectedGroupId,
        members.map((member) => member.userId),
      );

      if (!senderKey) {
        throw new Error("sender key is not available");
      }

      await updateGroupMessageByClientMsgId(selectedGroupId, targetClientMsgId, deletionPatch);

      const encrypted = await encryptWithSenderKey(
        senderKey.keyMaterial,
        JSON.stringify({
          kind: "group_delete",
          targetClientMsgId,
          deleteForEveryone: true,
        } satisfies GroupPayload),
        senderKey.senderKeyId,
      );
      const payload = {
        groupId: selectedGroupId,
        ciphertext: encrypted.ciphertext,
        header: encrypted.header,
        clientMsgId: createClientMsgId(),
        createdAt: Date.now(),
      };

      await trpc.group.post.mutate({
        ...payload,
        auth: await makeAuth("group.post", payload),
      });

      await refreshGroup(selectedGroupId);
      return true;
    },
    [
      activeView,
      ensureMySenderKey,
      identity,
      makeAuth,
      refreshDirect,
      refreshGroup,
      selectedGroupId,
      selectedPeerUserId,
      sendDirectPayload,
    ],
  );

  const handleTogglePin = useCallback(
    async (targetClientMsgIdRaw: string, isPinned: boolean): Promise<boolean> => {
      if (!identity) {
        return false;
      }

      const targetClientMsgId = sanitizeReplyMetaId(targetClientMsgIdRaw);
      if (!targetClientMsgId) {
        return false;
      }

      if (activeView === "direct") {
        if (!selectedPeerUserId) {
          return false;
        }

        await updateDirectMessageByClientMsgId(selectedPeerUserId, targetClientMsgId, {
          isPinned,
        });
        await sendDirectPayload(selectedPeerUserId, {
          kind: "dm_pin",
          targetClientMsgId,
          pinned: isPinned,
        });
        await refreshDirect(selectedPeerUserId);
        return true;
      }

      if (!selectedGroupId) {
        return false;
      }

      const members = await trpc.group.getMembers.query({
        groupId: selectedGroupId,
        auth: await makeAuth("group.getMembers", { groupId: selectedGroupId }),
      });

      const senderKey = await ensureMySenderKey(
        selectedGroupId,
        members.map((member) => member.userId),
      );

      if (!senderKey) {
        throw new Error("sender key is not available");
      }

      await updateGroupMessageByClientMsgId(selectedGroupId, targetClientMsgId, {
        isPinned,
      });

      const encrypted = await encryptWithSenderKey(
        senderKey.keyMaterial,
        JSON.stringify({
          kind: "group_pin",
          targetClientMsgId,
          pinned: isPinned,
        } satisfies GroupPayload),
        senderKey.senderKeyId,
      );
      const payload = {
        groupId: selectedGroupId,
        ciphertext: encrypted.ciphertext,
        header: encrypted.header,
        clientMsgId: createClientMsgId(),
        createdAt: Date.now(),
      };

      await trpc.group.post.mutate({
        ...payload,
        auth: await makeAuth("group.post", payload),
      });

      await refreshGroup(selectedGroupId);
      return true;
    },
    [
      activeView,
      ensureMySenderKey,
      identity,
      makeAuth,
      refreshDirect,
      refreshGroup,
      selectedGroupId,
      selectedPeerUserId,
      sendDirectPayload,
    ],
  );

  const handleToggleReaction = useCallback(
    async (
      targetClientMsgIdRaw: string,
      emojiRaw: string,
      isAdded: boolean,
    ): Promise<boolean> => {
      if (!identity) {
        return false;
      }

      const targetClientMsgId = sanitizeReplyMetaId(targetClientMsgIdRaw);
      const emoji = sanitizeReactionEmoji(emojiRaw);
      if (!targetClientMsgId || !emoji) {
        return false;
      }

      if (activeView === "direct") {
        if (!selectedPeerUserId) {
          return false;
        }

        const applied = await setDirectMessageReaction({
          peerUserId: selectedPeerUserId,
          clientMsgId: targetClientMsgId,
          emoji,
          userId: identity.userId,
          isAdded,
        });

        if (applied) {
          await sendDirectPayload(selectedPeerUserId, {
            kind: "dm_reaction",
            targetClientMsgId,
            emoji,
            isAdded,
          });
          await refreshDirect(selectedPeerUserId);
        }

        return applied;
      }

      if (!selectedGroupId) {
        return false;
      }

      const members = await trpc.group.getMembers.query({
        groupId: selectedGroupId,
        auth: await makeAuth("group.getMembers", { groupId: selectedGroupId }),
      });

      const senderKey = await ensureMySenderKey(
        selectedGroupId,
        members.map((member) => member.userId),
      );

      if (!senderKey) {
        throw new Error("sender key is not available");
      }

      const applied = await setGroupMessageReaction({
        groupId: selectedGroupId,
        clientMsgId: targetClientMsgId,
        emoji,
        userId: identity.userId,
        isAdded,
      });

      if (applied) {
        const encrypted = await encryptWithSenderKey(
          senderKey.keyMaterial,
          JSON.stringify({
            kind: "group_reaction",
            targetClientMsgId,
            emoji,
            isAdded,
          } satisfies GroupPayload),
          senderKey.senderKeyId,
        );
        const payload = {
          groupId: selectedGroupId,
          ciphertext: encrypted.ciphertext,
          header: encrypted.header,
          clientMsgId: createClientMsgId(),
          createdAt: Date.now(),
        };

        await trpc.group.post.mutate({
          ...payload,
          auth: await makeAuth("group.post", payload),
        });
      }

      if (applied) {
        await refreshGroup(selectedGroupId);
      }

      return applied;
    },
    [
      activeView,
      ensureMySenderKey,
      identity,
      makeAuth,
      refreshDirect,
      refreshGroup,
      selectedGroupId,
      selectedPeerUserId,
      sendDirectPayload,
    ],
  );

  const handleCreateGroup = useCallback(async () => {
    if (!identity || !groupNameInput.trim()) {
      return;
    }

    const members = parseUserIds(groupMembersInput);
    const payload = {
      name: groupNameInput.trim(),
      memberUserIds: members,
    };

    const created = await trpc.group.create.mutate({
      ...payload,
      auth: await makeAuth("group.create", payload),
    });

    await ensureMySenderKey(created.groupId, [identity.userId, ...members]);

    await refreshGroups();
    setSelectedGroupId(created.groupId);
    setActiveView("group");
    setGroupNameInput("");
    setGroupMembersInput("");
  }, [ensureMySenderKey, groupMembersInput, groupNameInput, identity, makeAuth, refreshGroups]);

  const handleAddMembersToGroup = useCallback(async () => {
    if (!identity || !selectedGroupId) {
      return;
    }

    const members = parseUserIds(addMembersInput);
    if (members.length === 0) {
      return;
    }

    const payload = {
      groupId: selectedGroupId,
      memberUserIds: members,
    };

    await trpc.group.addMembers.mutate({
      ...payload,
      auth: await makeAuth("group.addMembers", payload),
    });

    await ensureMySenderKey(selectedGroupId, [identity.userId, ...members]);
    setAddMembersInput("");
  }, [addMembersInput, ensureMySenderKey, identity, makeAuth, selectedGroupId]);

  const handleDeleteConversation = useCallback(async (): Promise<boolean> => {
    if (!identity) {
      return false;
    }

    if (activeView === "direct") {
      if (!selectedPeerUserId) {
        return false;
      }

      await deleteDirectMessages(selectedPeerUserId);
      setDirectMessages([]);
      await updateDirectMessagePreview(selectedPeerUserId);
      return true;
    }

    if (!selectedGroupId) {
      return false;
    }

    await deleteGroupMessages(selectedGroupId);
    setGroupMessages([]);
    await updateGroupMessagePreview(selectedGroupId);
    return true;
  }, [
    activeView,
    identity,
    selectedGroupId,
    selectedPeerUserId,
    updateDirectMessagePreview,
    updateGroupMessagePreview,
  ]);

  const handleDeleteSelectedMessages = useCallback(
    async (messageIds: number[]): Promise<boolean> => {
      if (!identity || messageIds.length === 0) {
        return false;
      }

      const ids = Array.from(new Set(messageIds.filter((messageId) => Number.isInteger(messageId))));

      if (ids.length === 0) {
        return false;
      }

      if (activeView === "direct") {
        if (!selectedPeerUserId) {
          return false;
        }

        await deleteDirectMessagesByIds(ids);
        await refreshDirect(selectedPeerUserId);
        await updateDirectMessagePreview(selectedPeerUserId);
        return true;
      }

      if (!selectedGroupId) {
        return false;
      }

      await deleteGroupMessagesByIds(ids);
      await refreshGroup(selectedGroupId);
      await updateGroupMessagePreview(selectedGroupId);
      return true;
    },
    [
      activeView,
      identity,
      refreshDirect,
      refreshGroup,
      selectedGroupId,
      selectedPeerUserId,
      updateDirectMessagePreview,
      updateGroupMessagePreview,
    ],
  );

  const pollDirectMessages = useCallback(async () => {
    if (!identity) {
      return;
    }

    const signalStore = await ensureSignalStoreSeeded(identity);
    const since = await getLastPollAt();

    const rows = await trpc.message.poll.query({
      since,
      auth: await makeAuth("message.poll", { since }),
    });

    let maxCreatedAt = since;
    let contactsUpdated = false;
    let latestIncomingPeerUserId: string | null = null;
    const touchedPeers = new Set<string>();

    for (const row of rows) {
      try {
        const plain = await decryptDirectPayload(signalStore, row.fromUserId, row.ciphertext, row.header);
        const parsed = parseDirectPayload(plain);

        if (parsed?.kind === "dm_text" || parsed?.kind === "dm_media") {
          const hasMedia = parsed.kind === "dm_media";
          const body = sanitizeMessageText(parsed.text);
          const attachments = hasMedia ? sanitizeMessageAttachments(parsed.attachments) : [];
          const normalizedBody = hasMedia && attachments.length === 0 && !body ? "[invalid attachment payload]" : body;
          const replyToClientMsgId = sanitizeReplyMetaId(parsed.replyToClientMsgId);
          const replyToText = sanitizeReplyMetaText(parsed.replyToText);
          const replyToSender = sanitizeReplyMetaText(parsed.replyToSender, 64);

          await addDirectMessage({
            clientMsgId: sanitizeReplyMetaId(row.clientMsgId),
            peerUserId: row.fromUserId,
            direction: "in",
            body: normalizedBody,
            kind: hasMedia ? "media" : "text",
            replyToClientMsgId,
            replyToText,
            replyToSender,
            attachments: attachments.length > 0 ? attachments : undefined,
            createdAt: row.createdAt,
          });

          const existingContact = await getContact(row.fromUserId);
          await upsertContact({
            userId: row.fromUserId,
            signalIdentityPublicKey: existingContact?.signalIdentityPublicKey ?? "",
            hasKeyMismatch: existingContact?.hasKeyMismatch ?? false,
            addedAt: existingContact?.addedAt ?? row.createdAt,
            displayName: resolveContactDisplayName(
              row.fromUserId,
              parsed.senderName,
              existingContact?.displayName,
            ),
            handle: resolveContactHandle(row.fromUserId, parsed.senderHandle, existingContact?.handle),
          });

          contactsUpdated = true;
          latestIncomingPeerUserId = row.fromUserId;
          touchedPeers.add(row.fromUserId);
        }

        if (parsed?.kind === "dm_edit") {
          const targetClientMsgId = sanitizeReplyMetaId(parsed.targetClientMsgId);
          if (targetClientMsgId) {
            await updateDirectMessageByClientMsgId(row.fromUserId, targetClientMsgId, {
              body: sanitizeMessageText(parsed.text),
              editedAt: row.createdAt,
            });
            touchedPeers.add(row.fromUserId);
          }
        }

        if (parsed?.kind === "dm_delete") {
          const targetClientMsgId = sanitizeReplyMetaId(parsed.targetClientMsgId);
          if (targetClientMsgId) {
            await updateDirectMessageByClientMsgId(row.fromUserId, targetClientMsgId, {
              body: TELEGRAM_DELETED_TEXT,
              isDeletedForEveryone: true,
              editedAt: row.createdAt,
              attachments: undefined,
              kind: "text",
            });
            touchedPeers.add(row.fromUserId);
          }
        }

        if (parsed?.kind === "dm_pin") {
          const targetClientMsgId = sanitizeReplyMetaId(parsed.targetClientMsgId);
          if (targetClientMsgId) {
            await updateDirectMessageByClientMsgId(row.fromUserId, targetClientMsgId, {
              isPinned: parsed.pinned,
            });
            touchedPeers.add(row.fromUserId);
          }
        }

        if (parsed?.kind === "dm_reaction") {
          const targetClientMsgId = sanitizeReplyMetaId(parsed.targetClientMsgId);
          const emoji = sanitizeReactionEmoji(parsed.emoji);
          if (targetClientMsgId && emoji) {
            await setDirectMessageReaction({
              peerUserId: row.fromUserId,
              clientMsgId: targetClientMsgId,
              emoji,
              userId: row.fromUserId,
              isAdded: parsed.isAdded,
            });
            touchedPeers.add(row.fromUserId);
          }
        }

        if (parsed?.kind === "sender_key_distribution") {
          await upsertSenderKey({
            groupId: parsed.groupId,
            senderUserId: parsed.senderUserId,
            senderKeyId: parsed.senderKeyId,
            keyMaterial: parsed.senderKey,
          });
          setStatus(`received sender key for group ${parsed.groupId}`);
        }
      } catch {
        setStatus("failed to decrypt direct message");
      }

      await trpc.message.ackDelete.mutate({
        queuedMsgId: row.queuedMsgId,
        auth: await makeAuth("message.ackDelete", { queuedMsgId: row.queuedMsgId }),
      });

      if (row.createdAt > maxCreatedAt) {
        maxCreatedAt = row.createdAt;
      }
    }

    if (maxCreatedAt > since) {
      await saveLastPollAt(maxCreatedAt);
    }

    if (contactsUpdated) {
      await refreshContacts();
    }

    if (touchedPeers.size > 0) {
      await Promise.all(Array.from(touchedPeers).map((peerUserId) => updateDirectMessagePreview(peerUserId)));
    }

    if (selectedPeerUserId) {
      await refreshDirect(selectedPeerUserId);
      return;
    }

    if (latestIncomingPeerUserId) {
      setSelectedPeerUserId(latestIncomingPeerUserId);
      setActiveView("direct");
      await refreshDirect(latestIncomingPeerUserId);
    }
  }, [
    identity,
    makeAuth,
    refreshContacts,
    refreshDirect,
    selectedPeerUserId,
    updateDirectMessagePreview,
  ]);

  const pollGroupMessages = useCallback(async () => {
    if (!identity) {
      return;
    }

    const serverGroups = await trpc.group.listMine.query({
      auth: await makeAuth("group.listMine", {}),
    });

    await upsertGroups(serverGroups.map((group) => ({
      groupId: group.groupId,
      name: group.name,
      role: group.role,
      createdAt: group.createdAt,
      createdByUserId: group.createdByUserId,
    })));

    const touchedGroups = new Set<number>();

    for (const group of serverGroups) {
      const since = await getGroupLastPollAt(group.groupId);
      const rows = await trpc.group.poll.query({
        groupId: group.groupId,
        since,
        auth: await makeAuth("group.poll", { groupId: group.groupId, since }),
      });

      let maxCreatedAt = since;

      for (const row of rows) {
        if (row.fromUserId === identity.userId) {
          if (row.createdAt > maxCreatedAt) {
            maxCreatedAt = row.createdAt;
          }
          continue;
        }

        let body = "[sender key missing]";
        let attachments: MessageAttachment[] | undefined;
        let replyToClientMsgId: string | undefined;
        let replyToText: string | undefined;
        let replyToSender: string | undefined;
        let isMessage = true;
        const senderKey = await getSenderKey(group.groupId, row.fromUserId);
        if (senderKey) {
          try {
            const parsed = parseGroupPayload(await decryptWithSenderKey(senderKey.keyMaterial, row.ciphertext, row.header));
            if (parsed?.kind === "group_media") {
              body = sanitizeMessageText(parsed.text);
              attachments = sanitizeMessageAttachments(parsed.attachments);
              if (attachments.length === 0) {
                attachments = undefined;
                body = "[invalid attachment payload]";
              }
              replyToClientMsgId = sanitizeReplyMetaId(parsed.replyToClientMsgId);
              replyToText = sanitizeReplyMetaText(parsed.replyToText);
              replyToSender = sanitizeReplyMetaText(parsed.replyToSender, 64);
            } else if (parsed?.kind === "group_text") {
              body = sanitizeMessageText(parsed.text);
              replyToClientMsgId = sanitizeReplyMetaId(parsed.replyToClientMsgId);
              replyToText = sanitizeReplyMetaText(parsed.replyToText);
              replyToSender = sanitizeReplyMetaText(parsed.replyToSender, 64);
            } else if (parsed?.kind === "group_edit") {
              const targetClientMsgId = sanitizeReplyMetaId(parsed.targetClientMsgId);
              if (targetClientMsgId) {
                await updateGroupMessageByClientMsgId(group.groupId, targetClientMsgId, {
                  body: sanitizeMessageText(parsed.text),
                  editedAt: row.createdAt,
                });
              }
              isMessage = false;
            } else if (parsed?.kind === "group_delete") {
              const targetClientMsgId = sanitizeReplyMetaId(parsed.targetClientMsgId);
              if (targetClientMsgId) {
                await updateGroupMessageByClientMsgId(group.groupId, targetClientMsgId, {
                  body: TELEGRAM_DELETED_TEXT,
                  editedAt: row.createdAt,
                  attachments: undefined,
                  kind: "text",
                  isDeletedForEveryone: true,
                });
              }
              isMessage = false;
            } else if (parsed?.kind === "group_pin") {
              const targetClientMsgId = sanitizeReplyMetaId(parsed.targetClientMsgId);
              if (targetClientMsgId) {
                await updateGroupMessageByClientMsgId(group.groupId, targetClientMsgId, {
                  isPinned: parsed.pinned,
                });
              }
              isMessage = false;
            } else if (parsed?.kind === "group_reaction") {
              const targetClientMsgId = sanitizeReplyMetaId(parsed.targetClientMsgId);
              const emoji = sanitizeReactionEmoji(parsed.emoji);
              if (targetClientMsgId && emoji) {
                await setGroupMessageReaction({
                  groupId: group.groupId,
                  clientMsgId: targetClientMsgId,
                  emoji,
                  userId: row.fromUserId,
                  isAdded: parsed.isAdded,
                });
              }
              isMessage = false;
            }
          } catch {
            body = "[failed to decrypt group message]";
          }
        }

        if (!isMessage) {
          touchedGroups.add(group.groupId);
        } else {
          await addGroupMessage({
            groupId: group.groupId,
            fromUserId: row.fromUserId,
            clientMsgId: sanitizeReplyMetaId(row.clientMsgId),
            kind: attachments ? "media" : "text",
            body,
            replyToClientMsgId,
            replyToText,
            replyToSender,
            attachments: attachments?.length ? attachments : undefined,
            createdAt: row.createdAt,
          });
        }
        touchedGroups.add(group.groupId);

        if (row.createdAt > maxCreatedAt) {
          maxCreatedAt = row.createdAt;
        }
      }

      if (maxCreatedAt > since) {
        await saveGroupLastPollAt(group.groupId, maxCreatedAt);
      }
    }

    await refreshGroups();
    if (touchedGroups.size > 0) {
      await Promise.all(Array.from(touchedGroups).map((groupId) => updateGroupMessagePreview(groupId)));
    }
    if (selectedGroupId) {
      await refreshGroup(selectedGroupId);
    }
  }, [identity, makeAuth, refreshGroup, refreshGroups, selectedGroupId, updateGroupMessagePreview]);

  useEffect(() => {
    if (!identity) {
      return;
    }

    let disposed = false;

    const tick = async () => {
      if (disposed) {
        return;
      }

      try {
        await pollDirectMessages();
        await pollGroupMessages();
      } catch {
        if (!disposed) {
          setStatus("poll failed, retrying...");
        }
      }
    };

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 3000);

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [identity, pollDirectMessages, pollGroupMessages]);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.userId === selectedPeerUserId),
    [contacts, selectedPeerUserId],
  );

  const selectedGroup = useMemo(
    () => groups.find((group) => group.groupId === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  // If loading, show nothing or a subtle loader to avoid flicker
  if (isLoading) {
    return <div className="min-h-svh w-full bg-[#0e1621]" />;
  }

  if (!identity) {
    return (
      <MessengerSetup
        recovery={recovery}
        importRecovery={importRecovery}
        status={status}
        onCreateIdentity={() => void handleCreateIdentity()}
        onImportIdentity={() => void handleImportIdentity()}
        onImportRecoveryChange={setImportRecovery}
      />
    );
  }

  const activeProfile = profile ?? defaultProfileForUser(identity.userId);

  return (
    <MessengerShell
      activeView={activeView}
      contacts={contacts}
      groups={groups}
      selectedPeerUserId={selectedPeerUserId}
      selectedGroupId={selectedGroupId}
      selectedContact={selectedContact}
      selectedGroup={selectedGroup}
      directMessages={directMessages}
      groupMessages={groupMessages}
      messageInput={messageInput}
      contactInput={contactInput}
      groupNameInput={groupNameInput}
      groupMembersInput={groupMembersInput}
      addMembersInput={addMembersInput}
      directMessagePreviews={directMessagePreviews}
      groupMessagePreviews={groupMessagePreviews}
      safetyNumber={safetyNumber}
      status={status}
      identityUserId={identity.userId}
      deviceId={DEVICE_ID}
      userProfile={activeProfile}
      onSetActiveView={setActiveView}
      onSelectPeer={(userId) => {
        setSelectedPeerUserId(userId);
        setActiveView("direct");
      }}
      onSelectGroup={(groupId) => {
        setSelectedGroupId(groupId);
        setActiveView("group");
      }}
      onContactInputChange={setContactInput}
      onAddContact={() => void handleAddContact()}
      onGroupNameInputChange={setGroupNameInput}
      onGroupMembersInputChange={setGroupMembersInput}
      onCreateGroup={() => void handleCreateGroup()}
      onAddMembersInputChange={setAddMembersInput}
      onAddMembers={() => void handleAddMembersToGroup()}
      onDeleteConversation={handleDeleteConversation}
      onDeleteSelectedMessages={handleDeleteSelectedMessages}
      onMessageInputChange={setMessageInput}
      onSend={handleSendWithClientError}
      onEditMessage={(targetClientMsgId, text) => handleEditMessage(targetClientMsgId, text)}
      onDeleteMessageForEveryone={(targetClientMsgId) => handleDeleteForEveryone(targetClientMsgId)}
      onTogglePinMessage={(targetClientMsgId, isPinned) => handleTogglePin(targetClientMsgId, isPinned)}
      onToggleReaction={(targetClientMsgId, emoji, isAdded) => handleToggleReaction(targetClientMsgId, emoji, isAdded)}
      onSaveProfile={handleSaveProfile}
    />
  );
}
