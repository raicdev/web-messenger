"use client";


import dynamic from 'next/dynamic';
import {
  AtSign,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  BadgeInfo,
  Circle,
  CheckCheck,
  Copy,
  CornerDownLeft,
  Forward,
  PencilLine,
  Pin,
  PinOff,
  Settings,
  Lock,
  Menu,
  MoreVertical,
  Paperclip,
  Search,
  SendHorizontal,
  Smile,
  Users,
  UserRound,
  X,
  FileText,
  Trash,
  Image as ImageIcon,
} from "lucide-react";
import {
  formatAttachmentSizeLabel,
  MAX_ATTACHMENT_COUNT,
  MAX_TOTAL_ATTACHMENT_BYTES,
  truncateFileName,
} from "@/lib/attachment";

// Dynamically import emoji picker to avoid SSR issues
const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";

import type {
  Contact,
  DirectMessage,
  GroupInfo,
  GroupMessage,
  MessageAttachment,
  UserProfile,
} from "@/lib/storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ActiveView = "direct" | "group";

const TG_COLORS = {
  bgMain: "bg-[#0e1621]",
  bgSidebar: "bg-[#17212b]",
  bgHeader: "bg-[#17212b]",
  bgInput: "bg-[#17212b]",
  bgSearch: "bg-[#242f3d]",
  bgBubbleSent: "bg-[#2b5278]",
  bgBubbleRecv: "bg-[#182533]",
  bgHover: "hover:bg-[#202b36]",
  bgActive: "bg-[#2b5278]",
  textPrimary: "text-[#f5f5f5]",
  textSecondary: "text-[#7f91a4]",
  textBlue: "text-[#6ab2f2]",
  border: "border-[#0e1621]",
  borderLight: "border-[#101924]",
  separator: "bg-[#0e1621]",
};

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "🎉"];

function inputClassName(): string {
  return "w-full rounded-md border-none bg-[#242f3d] px-3 py-2 text-[15px] text-[#f5f5f5] outline-none placeholder:text-[#7f91a4] transition-all";
}

const AVATAR_COLORS = [
  "bg-[#ff516a]",
  "bg-[#ff885e]",
  "bg-[#ffcd6a]",
  "bg-[#54cb68]",
  "bg-[#2a9ef1]",
  "bg-[#b580e2]",
  "bg-[#665fff]",
  "bg-[#21c0c0]",
];

type ReplyDraft = {
  clientMsgId?: string;
  sender: string;
  text: string;
};

function avatarColorClass(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? "bg-blue-500";
}

function initials(label: string): string {
  const clean = label.trim();
  if (!clean) {
    return "?";
  }
  return clean.slice(0, 1).toUpperCase();
}

function fallbackContactDisplayName(userId: string): string {
  return `User ${userId.slice(0, 8)}`;
}

function formatClock(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDatePill(createdAt: number): string {
  return new Date(createdAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

function isSameDay(left: number, right: number): boolean {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
}

function formatHandle(handle: string): string {
  const trimmed = handle.trim();
  if (!trimmed) {
    return "@user";
  }
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function contactName(contact: Contact): string {
  const knownName = contact.displayName?.trim();
  return knownName || "Unknown";
}

function contactHandle(contact: Contact): string {
  const knownHandle = contact.handle?.trim();
  return formatHandle(knownHandle || "unknown");
}

type MessengerSetupProps = {
  recovery: string;
  importRecovery: string;
  status: string;
  onCreateIdentity: () => void | Promise<void>;
  onImportIdentity: () => void | Promise<void>;
  onImportRecoveryChange: (value: string) => void;
};

export function MessengerSetup({
  recovery,
  importRecovery,
  status,
  onCreateIdentity,
  onImportIdentity,
  onImportRecoveryChange,
}: MessengerSetupProps) {
  return (
    <main className={`flex min-h-svh items-center justify-center ${TG_COLORS.bgMain} px-4 py-10 font-sans`}>
      <section className={`w-full max-w-md overflow-hidden rounded-xl ${TG_COLORS.bgSidebar} shadow-2xl`}>
        <div className="flex flex-col items-center p-10 pb-6 text-center">
          <div className="mb-6 flex size-24 items-center justify-center rounded-full bg-[#3e546a]">
            <Lock className="size-10 text-white" />
          </div>
          <h1 className={`text-2xl font-medium ${TG_COLORS.textPrimary}`}>Telegram-like Secure Chat</h1>
          <p className={`mt-2 text-sm ${TG_COLORS.textSecondary}`}>
            Create a local identity to start chatting securely.
          </p>
        </div>

        <div className="px-10 pb-10">
          <Button
            className="h-12 w-full rounded-xl bg-[#5288c1] text-base font-medium text-white hover:bg-[#4a7ab0] active:scale-[0.98] transition-transform"
            onClick={() => void onCreateIdentity()}
          >
            Create New Identity
          </Button>

          <div className="relative my-8 flex items-center justify-center">
            <div className={`absolute inset-0 top-1/2 h-px -translate-y-1/2 ${TG_COLORS.bgMain}`} />
            <span className={`relative ${TG_COLORS.bgSidebar} px-3 text-xs uppercase text-[#7f91a4]`}>
              Or Restore
            </span>
          </div>

          <div className="space-y-4">
            <textarea
              className={`${inputClassName()} min-h-[80px] text-xs font-mono`}
              value={importRecovery}
              onChange={(event) => onImportRecoveryChange(event.target.value)}
              placeholder="Paste recovery key here..."
            />
            <Button
              variant="outline"
              className={`h-12 w-full rounded-xl border-none bg-[#2b5278]/20 ${TG_COLORS.textBlue} hover:bg-[#2b5278]/30`}
              onClick={() => void onImportIdentity()}
            >
              Restore Identity
            </Button>
          </div>

          {recovery && (
            <div className="mt-8 animate-in fade-in slide-in-from-bottom-4">
              <p className={`mb-2 text-xs font-medium uppercase tracking-wider ${TG_COLORS.textSecondary}`}>
                Your Recovery Key
              </p>
              <div className="group relative rounded-lg bg-[#0e1621]/50 p-4 transition hover:bg-[#0e1621]">
                <p className="break-all font-mono text-xs text-[#d4e5f7]">{recovery}</p>
                <div className="absolute right-2 top-2 hidden rounded bg-[#17212b] px-2 py-1 text-xs text-white shadow-sm group-hover:block">
                  Copy
                </div>
              </div>
              <p className="mt-2 text-center text-[11px] text-[#ef5b5b]">
                Save this key securely! It is the only way to recover your account.
              </p>
            </div>
          )}
          
          <p className={`mt-6 text-center text-xs ${TG_COLORS.textSecondary}`}>Status: {status}</p>
        </div>
      </section>
    </main>
  );
}

type MessengerShellProps = {
  activeView: ActiveView;
  contacts: Contact[];
  groups: GroupInfo[];
  selectedPeerUserId: string;
  selectedGroupId: number | null;
  selectedContact: Contact | undefined;
  selectedGroup: GroupInfo | null;
  directMessages: DirectMessage[];
  groupMessages: GroupMessage[];
  messageInput: string;
  contactInput: string;
  groupNameInput: string;
  groupMembersInput: string;
  addMembersInput: string;
  directMessagePreviews: Record<string, string>;
  groupMessagePreviews: Record<number, string>;
  safetyNumber: string;
  status: string;
  identityUserId: string;
  deviceId: number;
  userProfile: UserProfile;
  onSetActiveView: (view: ActiveView) => void;
  onSelectPeer: (userId: string) => void;
  onSelectGroup: (groupId: number) => void;
  onContactInputChange: (value: string) => void;
  onAddContact: () => void | Promise<void>;
  onGroupNameInputChange: (value: string) => void;
  onGroupMembersInputChange: (value: string) => void;
  onCreateGroup: () => void | Promise<void>;
  onAddMembersInputChange: (value: string) => void;
  onAddMembers: () => void | Promise<void>;
  onDeleteConversation: () => Promise<boolean>;
  onDeleteSelectedMessages: (messageIds: number[]) => Promise<boolean>;
  onMessageInputChange: (value: string) => void;
  onSend: (
    attachments: File[],
    replyContext?: {
      clientMsgId?: string;
      text?: string;
      sender?: string;
    },
  ) => Promise<boolean>;
  onEditMessage: (targetClientMsgId: string, text: string) => Promise<boolean>;
  onDeleteMessageForEveryone: (targetClientMsgId: string) => Promise<boolean>;
  onTogglePinMessage: (targetClientMsgId: string, pinned: boolean) => Promise<boolean>;
  onToggleReaction: (targetClientMsgId: string, emoji: string, isAdded: boolean) => Promise<boolean>;
  onSaveProfile: (
    profile: Pick<UserProfile, "displayName" | "handle" | "about">,
  ) => Promise<{ ok: boolean; error?: string }>;
};

export function MessengerShell({
  activeView,
  contacts,
  groups,
  selectedPeerUserId,
  selectedGroupId,
  selectedContact,
  selectedGroup,
  directMessages,
  groupMessages,
  messageInput,
  contactInput,
  groupNameInput,
  groupMembersInput,
  addMembersInput,
  directMessagePreviews,
  groupMessagePreviews,
  safetyNumber,
  status,
  identityUserId,
  deviceId,
  userProfile,
  onSetActiveView,
  onSelectPeer,
  onSelectGroup,
  onContactInputChange,
  onAddContact,
  onGroupNameInputChange,
  onGroupMembersInputChange,
  onCreateGroup,
  onAddMembersInputChange,
  onAddMembers,
  onDeleteConversation,
  onDeleteSelectedMessages,
  onMessageInputChange,
  onSend,
  onEditMessage,
  onDeleteMessageForEveryone,
  onTogglePinMessage,
  onToggleReaction,
  onSaveProfile,
}: MessengerShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // --- New Features State ---
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [sidebarSearchTerm, setSidebarSearchTerm] = useState("");
  const [chatSearchTerm, setChatSearchTerm] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [showAccountSheet, setShowAccountSheet] = useState(false);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<number>>(new Set());
  const [isDeletingMessages, setIsDeletingMessages] = useState(false);
  const [attachmentInputError, setAttachmentInputError] = useState("");
  const [replyDraft, setReplyDraft] = useState<ReplyDraft | null>(null);
  const [editingDraft, setEditingDraft] = useState<ReplyDraft | null>(null);
  const [settingsDraft, setSettingsDraft] = useState({
    displayName: userProfile.displayName,
    handle: userProfile.handle,
    about: userProfile.about,
  });
  const [settingsError, setSettingsError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(0);
  const [pendingJumpMessageId, setPendingJumpMessageId] = useState<number | null>(null);

  const messageNodeRefs = useRef(new Map<number, HTMLDivElement>());
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Search Logic ---
  const loweredSidebarSearchTerm = sidebarSearchTerm.toLowerCase();
  const loweredChatSearchTerm = chatSearchTerm.toLowerCase();
  const filteredContacts = contacts.filter((contact) =>
    contact.userId.toLowerCase().includes(loweredSidebarSearchTerm) ||
    (contact.displayName ?? "").toLowerCase().includes(loweredSidebarSearchTerm) ||
    (contact.handle ?? "").toLowerCase().includes(loweredSidebarSearchTerm),
  );
  
  const filteredGroups = groups.filter(g => 
    g.name.toLowerCase().includes(sidebarSearchTerm.toLowerCase())
  );

  const messageMatchesSearch = useCallback((message: {
    body: string;
    attachments?: MessageAttachment[];
  }): boolean => {
    if (!loweredChatSearchTerm) {
      return true;
    }

    if (message.body.toLowerCase().includes(loweredChatSearchTerm)) {
      return true;
    }

    return (message.attachments ?? []).some((attachment) =>
      attachment.name.toLowerCase().includes(loweredChatSearchTerm),
    );
  }, [loweredChatSearchTerm]);

  const normalizeReplyText = (text: string): string => text.replace(/\s+/g, " ").trim().slice(0, 180);

  const getReplyDraftText = (message: DirectMessage | GroupMessage): string | null => {
    if (message.body.trim()) {
      return normalizeReplyText(message.body);
    }

    if (message.kind === "media" && message.attachments?.length) {
      return "Attachment";
    }

    return null;
  };

  const buildReplyDraftFromDirectMessage = (message: DirectMessage): ReplyDraft | null => {
    const draftText = getReplyDraftText(message);
    if (!message.clientMsgId || !draftText) {
      return null;
    }

    const fallbackDisplayName = selectedContact?.userId ? contactName(selectedContact) : fallbackContactDisplayName(selectedPeerUserId);

    const senderLabel =
      message.direction === "out"
        ? "You"
        : fallbackDisplayName;

    return {
      clientMsgId: message.clientMsgId,
      sender: senderLabel,
      text: draftText,
    };
  };

  const buildReplyDraftFromGroupMessage = (message: GroupMessage): ReplyDraft | null => {
    const draftText = getReplyDraftText(message);
    if (!message.clientMsgId || !draftText) {
      return null;
    }

    const senderLabel =
      message.fromUserId === identityUserId ? "You" : `@${message.fromUserId.slice(0, 10)}`;

    return {
      clientMsgId: message.clientMsgId,
      sender: senderLabel,
      text: draftText,
    };
  };

  const getMessageTextForReply = (message: DirectMessage | GroupMessage): string => {
    if (message.body.trim()) {
      return message.body;
    }

    if (message.kind === "media" && message.attachments?.length) {
      return "Attachment";
    }

    return "";
  };

  const getReactionEntries = (reactions: Record<string, string[]> | undefined): Array<[string, string[]]> => {
    if (!reactions) {
      return [];
    }
    return Object.entries(reactions).filter((entry) => entry[1].length > 0);
  };

  const hasUserReaction = (reactions: Record<string, string[]> | undefined, emoji: string): boolean => {
    if (!reactions?.[emoji]) {
      return false;
    }
    return reactions[emoji].includes(identityUserId);
  };

  const decodeAttachmentToFile = (attachment: MessageAttachment): File | null => {
    try {
      const binary = atob(attachment.dataBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new File([bytes], attachment.name, { type: attachment.mimeType });
    } catch {
      return null;
    }
  };

  const filteredDirectMessages = useMemo(
    () => directMessages.filter(messageMatchesSearch),
    [directMessages, messageMatchesSearch],
  );
  const filteredGroupMessages = useMemo(
    () => groupMessages.filter(messageMatchesSearch),
    [groupMessages, messageMatchesSearch],
  );

  const displayDirectMessages = useMemo(
    () => (showSearch && chatSearchTerm ? filteredDirectMessages : directMessages),
    [chatSearchTerm, directMessages, filteredDirectMessages, showSearch],
  );
  const displayGroupMessages = useMemo(
    () => (showSearch && chatSearchTerm ? filteredGroupMessages : groupMessages),
    [chatSearchTerm, filteredGroupMessages, groupMessages, showSearch],
  );
  const allActiveMessages = useMemo(
    () => (activeView === "direct" ? directMessages : groupMessages),
    [activeView, directMessages, groupMessages],
  );
  const activeMessages = useMemo(
    () => (activeView === "direct" ? displayDirectMessages : displayGroupMessages),
    [activeView, displayDirectMessages, displayGroupMessages],
  );
  const pinnedMessages = useMemo(
    () => allActiveMessages.filter((message) => message.isPinned === true),
    [allActiveMessages],
  );
  const latestPinnedMessage = pinnedMessages.at(-1);
  const chatSearchMatches = useMemo(
    () =>
      showSearch && chatSearchTerm
        ? activeMessages.reduce<number[]>((acc, message) => {
            if (!messageMatchesSearch(message)) {
              return acc;
            }

            const messageId = message.id;
            if (typeof messageId === "number") {
              acc.push(messageId);
            }

            return acc;
          }, [])
        : [],
    [activeMessages, chatSearchTerm, messageMatchesSearch, showSearch],
  );
  const activeMessageIdByClientMsgId = useMemo(
    () =>
      activeMessages.reduce<Map<string, number>>((acc, message) => {
        if (typeof message.id !== "number" || !message.clientMsgId) {
          return acc;
        }
        acc.set(message.clientMsgId, message.id);
        return acc;
      }, new Map()),
    [activeMessages],
  );
  const allMessageIdByClientMsgId = useMemo(
    () =>
      allActiveMessages.reduce<Map<string, number>>((acc, message) => {
        if (typeof message.id !== "number" || !message.clientMsgId) {
          return acc;
        }
        acc.set(message.clientMsgId, message.id);
        return acc;
      }, new Map()),
    [allActiveMessages],
  );
  const normalizedHandle = settingsDraft.handle.trim().toLowerCase();
  const isHandleValid = /^[a-z0-9_]{3,24}$/.test(normalizedHandle);
  const hasActiveChat =
    activeView === "direct" ? Boolean(selectedPeerUserId) : Boolean(selectedGroupId);
  const canDispatch = hasActiveChat && (messageInput.trim().length > 0 || attachments.length > 0);
  const closeSidebarOnMobile = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (window.matchMedia("(max-width: 767px)").matches) {
      setIsSidebarOpen(false);
    }
  }, []);

  const jumpToMessage = useCallback((messageId: number | undefined | null) => {
    if (typeof messageId !== "number") {
      return;
    }

    const node = messageNodeRefs.current.get(messageId);
    if (!node) {
      setPendingJumpMessageId(messageId);
      return;
    }

    setPendingJumpMessageId(null);
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);

    window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageId ? null : current));
    }, 1800);
  }, []);

  const jumpToPinnedMessage = useCallback(() => {
    const pinnedId = latestPinnedMessage?.id;
    if (typeof pinnedId !== "number") {
      return;
    }

    if (showSearch && !activeMessages.some((message) => message.id === pinnedId)) {
      setShowSearch(false);
      setChatSearchTerm("");
    }

    jumpToMessage(pinnedId);
  }, [activeMessages, jumpToMessage, latestPinnedMessage?.id, showSearch]);

  const jumpToSearchMatch = useCallback((targetIndex: number) => {
    if (chatSearchMatches.length === 0) {
      return;
    }

    const bounded = ((targetIndex % chatSearchMatches.length) + chatSearchMatches.length) % chatSearchMatches.length;
    const targetMessageId = chatSearchMatches[bounded];
    setActiveSearchMatchIndex(bounded);
    jumpToMessage(targetMessageId);
  }, [chatSearchMatches, jumpToMessage]);

  const jumpToReplyTarget = useCallback((replyToClientMsgId?: string) => {
    if (!replyToClientMsgId) {
      return;
    }

    const target =
      activeMessageIdByClientMsgId.get(replyToClientMsgId) ??
      allMessageIdByClientMsgId.get(replyToClientMsgId);
    if (typeof target !== "number") {
      return;
    }

    if (showSearch && !activeMessages.some((message) => message.id === target)) {
      setShowSearch(false);
      setChatSearchTerm("");
    }

    jumpToMessage(target);
  }, [activeMessageIdByClientMsgId, activeMessages, allMessageIdByClientMsgId, jumpToMessage, showSearch]);

  const getMessageNodeRef = (messageId: number | undefined) => (node: HTMLDivElement | null) => {
    if (typeof messageId !== "number") {
      return;
    }

    if (node) {
      messageNodeRefs.current.set(messageId, node);
      return;
    }

    messageNodeRefs.current.delete(messageId);
  };

  // --- Handlers ---
  const onEmojiClick = (emojiObject: { emoji: string }) => {
    onMessageInputChange(messageInput + emojiObject.emoji);
  };

  const handleCopyMessageText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    setTimeout(() => {
      setCopyState("idle");
    }, 1500);
  };

  const renderMessageTextWithSearchMatch = (text: string) => {
    if (!loweredChatSearchTerm) {
      return text;
    }

    const escaped = loweredChatSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchParts = text.split(new RegExp(`(${escaped})`, "gi"));

    return searchParts.map((part, index) => {
      if (part.toLowerCase() !== loweredChatSearchTerm) {
        return <span key={`${part}-${index}`}>{part}</span>;
      }

      return (
        <span
          key={`${part}-${index}`}
          className="rounded-[4px] bg-[#244f7e] px-[2px] text-[#e2f0ff]"
        >
          {part}
        </span>
      );
    });
  };

  const handleCopyUserId = async () => {
    try {
      await navigator.clipboard.writeText(identityUserId);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    setTimeout(() => {
      setCopyState("idle");
    }, 1500);
  };

  const handleCopyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    setTimeout(() => {
      setCopyState("idle");
    }, 1500);
  };

  const handleSaveSettings = async () => {
    setSettingsError("");

    if (!settingsDraft.displayName.trim()) {
      setSettingsError("Display name is required.");
      return;
    }

    if (!isHandleValid) {
      setSettingsError("Handle must be 3-24 chars (a-z, 0-9, _).");
      return;
    }

    setIsSavingProfile(true);
    const result = await onSaveProfile({
      displayName: settingsDraft.displayName,
      handle: normalizedHandle,
      about: settingsDraft.about,
    });
    setIsSavingProfile(false);

    if (!result.ok) {
      setSettingsError(result.error ?? "Failed to save profile.");
      return;
    }

    setShowSettingsSheet(false);
  };

  const toggleMessageSelection = (messageId: number | undefined) => {
    if (typeof messageId !== "number") {
      return;
    }

    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const clearMessageSelection = () => {
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
  };

  const deleteSelectedMessages = async () => {
    if (selectedMessageIds.size === 0 || isDeletingMessages) {
      return;
    }

    if (!confirm("Delete selected messages from this chat?")) {
      return;
    }

    setIsDeletingMessages(true);
    const ok = await onDeleteSelectedMessages(Array.from(selectedMessageIds));
    setIsDeletingMessages(false);

    if (ok) {
      clearMessageSelection();
    }
  };

  const deleteCurrentConversation = async () => {
    if (isDeletingMessages) {
      return;
    }

    if (!confirm("Clear this chat history locally?")) {
      return;
    }

    setIsDeletingMessages(true);
    const ok = await onDeleteConversation();
    setIsDeletingMessages(false);

    if (ok) {
      clearMessageSelection();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) {
      return;
    }

    setAttachmentInputError("");
    setAttachments((current) => {
      const currentBytes = current.reduce((total, file) => total + file.size, 0);
      const remaining = Math.max(0, MAX_ATTACHMENT_COUNT - current.length);
      const accepted: File[] = [];
      const rejected: string[] = [];
      let nextBytes = currentBytes;

      for (const file of picked) {
        if (accepted.length >= remaining) {
          rejected.push(file.name);
          continue;
        }

        if (file.size + nextBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
          rejected.push(file.name);
          continue;
        }

        accepted.push(file);
        nextBytes += file.size;
      }

      if (rejected.length > 0) {
        setAttachmentInputError(`Some files were skipped (max ${MAX_ATTACHMENT_COUNT} files / ${formatAttachmentSizeLabel(MAX_TOTAL_ATTACHMENT_BYTES)} total).`);
      }
      return [...current, ...accepted];
    });
  };

  const removeAttachment = (index: number) => {
    setAttachmentInputError("");
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const clearComposer = () => {
    onMessageInputChange("");
    setAttachments([]);
    setAttachmentInputError("");
    setShowEmojiPicker(false);
    setReplyDraft(null);
    setEditingDraft(null);
  };

  const stopEditing = () => {
    setEditingDraft(null);
    onMessageInputChange("");
    setReplyDraft(null);
  };

  const handleSaveEdit = async () => {
    if (!editingDraft?.clientMsgId) {
      return;
    }

    const ok = await onEditMessage(editingDraft.clientMsgId, messageInput);
    if (!ok) {
      return;
    }

    clearComposer();
    onMessageInputChange("");
  };

  const startEditingDirectMessage = (message: DirectMessage) => {
    const text = getMessageTextForReply(message);
    if (!message.clientMsgId || !text) {
      return;
    }

    setEditingDraft({
      clientMsgId: message.clientMsgId,
      sender: "You",
      text,
    });
    onMessageInputChange(text);
    setReplyDraft(null);
  };

  const startEditingGroupMessage = (message: GroupMessage) => {
    const text = getMessageTextForReply(message);
    if (!message.clientMsgId || !text) {
      return;
    }

    setEditingDraft({
      clientMsgId: message.clientMsgId,
      sender: message.fromUserId === identityUserId ? "You" : `@${message.fromUserId.slice(0, 10)}`,
      text,
    });
    onMessageInputChange(text);
    setReplyDraft(null);
  };

  const handleForwardMessage = async (message: DirectMessage | GroupMessage) => {
    if (!message.clientMsgId) {
      return;
    }

    const forwardText = `Forwarded message\n${getMessageTextForReply(message)}`;
    onMessageInputChange(forwardText);

    if (message.attachments?.length) {
      const files = (
        await Promise.all(message.attachments.map((attachment) => decodeAttachmentToFile(attachment)))
      ).filter((file): file is File => file !== null);
      const totalSize = files.reduce((total, file) => total + file.size, 0);

      if (files.length !== message.attachments.length || files.length > MAX_ATTACHMENT_COUNT || totalSize > MAX_TOTAL_ATTACHMENT_BYTES) {
        setAttachmentInputError("Some attachments could not be forwarded.");
        setAttachments(files);
      } else {
        setAttachments(files);
        setAttachmentInputError("");
      }
    }

    setReplyDraft(null);
    setEditingDraft(null);
  };

  const renderMessageAttachmentPreviews = (message: {
    kind?: "text" | "media";
    body: string;
    attachments?: MessageAttachment[];
  }) => {
    if (message.kind !== "media" || !message.attachments?.length) {
      return null;
    }

    return (
      <div className="mt-2 space-y-2">
        {message.body ? <p className={`text-[14px] ${TG_COLORS.textPrimary}`}>{message.body}</p> : null}
        {message.attachments.map((attachment) => {
          const isImage = attachment.mimeType.startsWith("image/");
          const attachmentDataUrl = `data:${attachment.mimeType};base64,${attachment.dataBase64}`;
          const label = truncateFileName(attachment.name, 40);
          if (isImage) {
            return (
              <a
                key={attachment.id}
                href={attachmentDataUrl}
                rel="noreferrer"
                target="_blank"
                className="group block overflow-hidden rounded-xl bg-black/20 transition hover:ring-1 hover:ring-[#2ab2f2]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={attachment.name}
                  className="max-h-48 w-full object-cover"
                  src={attachmentDataUrl}
                />
                <p className="p-2 text-[11px] text-[#9fc2ed]">{label}</p>
              </a>
            );
          }

          return (
            <a
              key={attachment.id}
              href={attachmentDataUrl}
              rel="noreferrer"
              download={attachment.name}
              className="block rounded-xl bg-[#122232] px-3 py-2 text-xs transition hover:bg-[#173d5a]"
            >
              <p className="truncate text-[#f5f5f5]">{label}</p>
              <p className="mt-1 text-[11px] text-[#9fc2ed]">{formatAttachmentSizeLabel(attachment.size)}</p>
            </a>
          );
        })}
      </div>
    );
  };

  const renderReplyPreview = (message: {
    replyToClientMsgId?: string;
    replyToSender?: string;
    replyToText?: string;
  }, onJump?: (clientMsgId?: string) => void) => {
    if (!message.replyToClientMsgId || !message.replyToText) {
      return null;
    }

    return (
      <div className="mb-2 rounded-lg border border-[#2a3b52] bg-[#0f2437]/50 px-2 py-1.5">
        <button
          type="button"
          className="w-full rounded-md text-left transition hover:bg-[#16314a]/60"
          onClick={() => onJump?.(message.replyToClientMsgId)}
        >
        <p className="text-[11px] uppercase tracking-widest text-[#7aa3cb]">
          Replying to {message.replyToSender || "message"}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-[#d5e8ff]">{message.replyToText}</p>
        </button>
      </div>
    );
  };

  const renderMessageActionMenu = (args: {
    messageId: number | undefined;
    body: string;
    clientMsgId?: string;
    isPinned?: boolean;
    canEdit: boolean;
    canDelete: boolean;
    onReply: () => void;
    onEdit: () => void;
    onForward: () => void;
  }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full bg-black/30 p-1 text-[#9ec0df] transition hover:text-white"
          title="Message actions"
        >
          <MoreVertical className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        collisionPadding={12}
        className="w-48 border-[#24364b] bg-[#182533] p-1 text-[#d8ecff]"
      >
        <DropdownMenuItem
          className="text-[#d8ecff] focus:bg-[#22344a] focus:text-[#d8ecff]"
          onSelect={() => {
            void handleCopyMessageText(args.body || "");
          }}
        >
          <Copy className="size-3.5" />
          Copy Message
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={typeof args.messageId !== "number"}
          className="text-[#d8ecff] focus:bg-[#22344a] focus:text-[#d8ecff] data-[disabled]:text-[#5d778f]"
          onSelect={() => {
            void handleDeleteForMeLocal(args.messageId);
          }}
        >
          <Trash className="size-3.5" />
          Delete for me
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-[#d8ecff] focus:bg-[#22344a] focus:text-[#d8ecff]"
          onSelect={args.onReply}
        >
          <CornerDownLeft className="size-3.5" />
          Reply
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!args.canEdit}
          className="text-[#d8ecff] focus:bg-[#22344a] focus:text-[#d8ecff] data-[disabled]:text-[#5d778f]"
          onSelect={args.onEdit}
        >
          <PencilLine className="size-3.5" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-[#d8ecff] focus:bg-[#22344a] focus:text-[#d8ecff]"
          onSelect={args.onForward}
        >
          <Forward className="size-3.5" />
          Forward
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-[#d8ecff] focus:bg-[#22344a] focus:text-[#d8ecff]"
          onSelect={() => {
            void handlePinMessageLocal(args.clientMsgId, !args.isPinned);
          }}
        >
          {args.isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          {args.isPinned ? "Unpin" : "Pin"}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-[#22354a]" />
        <DropdownMenuItem
          disabled={!args.canDelete}
          className="text-[#ffb7bd] focus:bg-[#40161f] focus:text-[#ffb7bd] data-[disabled]:text-[#5d778f]"
          onSelect={() => {
            if (!args.canDelete) {
              return;
            }
            void handleDeleteForEveryoneLocal(args.clientMsgId);
          }}
        >
          <Trash className="size-3.5" />
          Delete for everyone
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderReactionRow = (message: {
    clientMsgId?: string;
    reactions?: Record<string, string[]>;
    isDeletedForEveryone?: boolean;
  }, isOut = false) => {
    const reactions = message.reactions;
    const hasReactions = reactions && Object.keys(reactions).length > 0;

    const isDisabled = message.isDeletedForEveryone || !message.clientMsgId;

    return (
      <div className={`mt-1 flex flex-wrap gap-1 ${isOut ? "justify-end" : "justify-start"}`}>
        {hasReactions
          ? getReactionEntries(reactions).map(([emoji, users]) => {
              const active = hasUserReaction(reactions, emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                    active
                      ? "border-[#8eb9dc] bg-[#173b57] text-[#cce4ff]"
                      : "border-[#2f445b] text-[#9fc0df] transition hover:border-[#4f6f8d]"
                  } ${isDisabled ? "opacity-70" : ""}`}
                  onClick={async () => {
                    if (isDisabled) {
                      return;
                    }
                    await onToggleReaction(
                      message.clientMsgId as string,
                      emoji,
                      !hasUserReaction(reactions, emoji),
                    );
                  }}
                >
                  <span>{emoji}</span>
                  <span>{users.length}</span>
                </button>
              );
            })
          : null}
        {!hasReactions
          ? QUICK_REACTIONS.map((emoji) => {
              const active = message.clientMsgId ? hasUserReaction(reactions, emoji) : false;
              return (
                <button
                  key={emoji}
                  type="button"
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    active
                      ? "border-[#8eb9dc] bg-[#173b57] text-[#cce4ff]"
                      : "border-[#2f445b] text-[#a0c7e8] hover:border-[#4f6f8d] hover:bg-[#173b57]"
                  } ${isDisabled ? "opacity-70 pointer-events-none" : ""}`}
                  onClick={async () => {
                    if (isDisabled || !message.clientMsgId) {
                      return;
                    }
                    await onToggleReaction(message.clientMsgId, emoji, !active);
                  }}
                >
                  {emoji}
                </button>
              );
            })
          : null}
      </div>
    );
  };

  const handleDeleteForEveryoneLocal = async (targetClientMsgId: string | undefined): Promise<boolean> => {
    if (!targetClientMsgId) {
      return false;
    }
    if (!confirm("Delete this message for everyone?")) {
      return false;
    }

    const ok = await onDeleteMessageForEveryone(targetClientMsgId);
    return ok;
  };

  const handleDeleteForMeLocal = async (messageId: number | undefined): Promise<boolean> => {
    if (typeof messageId !== "number") {
      return false;
    }

    const ok = await onDeleteSelectedMessages([messageId]);
    if (ok) {
      setSelectedMessageIds((current) => {
        const next = new Set(current);
        next.delete(messageId);
        return next;
      });
    }

    return ok;
  };

  const handlePinMessageLocal = async (targetClientMsgId: string | undefined, pinned: boolean): Promise<void> => {
    if (!targetClientMsgId) {
      return;
    }
    await onTogglePinMessage(targetClientMsgId, pinned);
  };

  const handleSendWithAttachments = async () => {
    if (!hasActiveChat) {
      return;
    }

    if (editingDraft?.clientMsgId) {
      await handleSaveEdit();
      return;
    }

    const sent = await onSend(attachments, replyDraft ?? undefined);
    if (!sent) {
      return;
    }

    setAttachments([]);
    setAttachmentInputError("");
    setReplyDraft(null);
    setShowEmojiPicker(false);
  };

  useEffect(() => {
    // Keep the latest message visible after sending attachments or receiving new content.
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [directMessages, groupMessages, attachments]);

  useEffect(() => {
    setReplyDraft(null);
    setEditingDraft(null);
  }, [activeView, selectedPeerUserId, selectedGroupId]);

  useEffect(() => {
    if (!showSearch) {
      setActiveSearchMatchIndex(0);
      return;
    }

    if (chatSearchMatches.length === 0) {
      setActiveSearchMatchIndex(0);
      return;
    }

    setActiveSearchMatchIndex((current) => {
      if (current >= 0 && current < chatSearchMatches.length) {
        return current;
      }
      return 0;
    });
  }, [chatSearchMatches, showSearch]);

  useEffect(() => {
    if (activeSearchMatchIndex < 0 || chatSearchMatches.length === 0) {
      return;
    }

    jumpToMessage(chatSearchMatches[activeSearchMatchIndex]);
  }, [activeSearchMatchIndex, chatSearchMatches, jumpToMessage]);

  useEffect(() => {
    if (typeof pendingJumpMessageId !== "number") {
      return;
    }

    const node = messageNodeRefs.current.get(pendingJumpMessageId);
    if (!node) {
      return;
    }

    jumpToMessage(pendingJumpMessageId);
  }, [activeMessages, jumpToMessage, pendingJumpMessageId]);

  useEffect(() => {
    if (typeof highlightedMessageId !== "number") {
      return;
    }

    if (activeMessages.some((message) => message.id === highlightedMessageId)) {
      return;
    }

    setHighlightedMessageId(null);
  }, [activeMessages, highlightedMessageId]);

  useEffect(() => {
    setSettingsDraft({
      displayName: userProfile.displayName,
      handle: userProfile.handle,
      about: userProfile.about,
    });
  }, [userProfile.about, userProfile.displayName, userProfile.handle]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const syncSidebar = (matches: boolean) => {
      if (matches) {
        setIsSidebarOpen(true);
      }
    };
    syncSidebar(mediaQuery.matches);
    const onChange = (event: MediaQueryListEvent) => {
      syncSidebar(event.matches);
    };
    mediaQuery.addEventListener("change", onChange);
    return () => {
      mediaQuery.removeEventListener("change", onChange);
    };
  }, []);

  return (
    <main className={`flex h-svh w-full overflow-hidden ${TG_COLORS.bgMain} font-sans`}>
      {/* Sidebar */}
      <aside
        className={`${
          isSidebarOpen ? "w-full md:w-[420px]" : "hidden w-0"
        } flex flex-col border-r ${TG_COLORS.border} ${TG_COLORS.bgSidebar} transition-all duration-300 md:flex shrink-0 h-full`}
      >
        {/* Sidebar Header */}
        <div className="relative flex items-center gap-4 px-4 py-2 shrink-0 h-[56px]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-[#707579] hover:bg-[#2b2d31] hover:text-[#f5f5f5] h-10 w-10 rounded-full data-[state=open]:bg-[#2b2d31] data-[state=open]:text-[#f5f5f5]"
              >
                <Menu className="size-6" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={8}
              collisionPadding={12}
              className="z-[60] w-64 border-[#0e1621] bg-[#242f3d] p-1 text-[#f5f5f5]"
            >
              <DropdownMenuItem
                className="text-[15px] text-[#f5f5f5] focus:bg-[#17212b] focus:text-[#f5f5f5]"
                onSelect={() => {
                  void handleCopyUserId();
                }}
              >
                <Copy className="size-4 text-[#7f91a4]" />
                {copyState === "copied" ? "Copied User ID" : "Copy User ID"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-[15px] text-[#f5f5f5] focus:bg-[#17212b] focus:text-[#f5f5f5]"
                onSelect={() => {
                  setShowAccountSheet(true);
                }}
              >
                <UserRound className="size-4 text-[#7f91a4]" />
                My Account
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-[15px] text-[#f5f5f5] focus:bg-[#17212b] focus:text-[#f5f5f5]"
                onSelect={() => {
                  setSettingsError("");
                  setShowSettingsSheet(true);
                }}
              >
                <Settings className="size-4 text-[#7f91a4]" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#707579]">
              <Search className="size-5" />
            </div>
            <input
              className={`h-10 w-full rounded-full border-none ${TG_COLORS.bgSearch} pl-10 pr-4 text-[15px] ${TG_COLORS.textPrimary} outline-none placeholder:text-[#707579] transition-all focus:bg-[#242f3d] focus:text-white`}
              placeholder="Search"
              value={sidebarSearchTerm}
              onChange={(e) => setSidebarSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="px-3 pb-2">
          <div className="rounded-xl bg-[#1f2c3a] px-3 py-3">
            <div className="flex items-center gap-3">
              <div className={`flex size-11 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white ${avatarColorClass(identityUserId)}`}>
                {initials(userProfile.displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-[#f5f5f5]">{userProfile.displayName}</p>
                <p className="truncate text-[13px] text-[#89aac8]">{formatHandle(userProfile.handle)}</p>
              </div>
              <button
                className="rounded-lg bg-[#2b5278] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#38638c]"
                onClick={() => void handleCopyUserId()}
              >
                {copyState === "copied" ? "Copied" : "ID"}
              </button>
            </div>
          </div>
        </div>

        {/* Tabs (Direct / Groups) - Telegram-like segments */}
        <div className="flex px-2 pb-2 shrink-0 space-x-1">
          {/* We can use a more subtle tab design or just keep the list merged if we want to be closer to "All Chats" 
              but for this app's logic, tabs are fine, let's style them like Telegram folders */}
          <button
            onClick={() => onSetActiveView("direct")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              activeView === "direct"
                ? "bg-[#2b5278] text-white"
                : "text-[#9e9e9e] hover:bg-[#202b36] hover:text-[#d9d9d9]"
            }`}
          >
            Private
          </button>
          <button
            onClick={() => onSetActiveView("group")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              activeView === "group"
                ? "bg-[#2b5278] text-white"
                : "text-[#9e9e9e] hover:bg-[#202b36] hover:text-[#d9d9d9]"
            }`}
          >
            Groups
          </button>
        </div>

        {/* Contact/Group List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#2f2f2f] hover:scrollbar-thumb-[#3e3e3e]">
          {activeView === "direct" ? (
            filteredContacts.length > 0 ? (
              filteredContacts.map((contact) => {
                const isActive = selectedPeerUserId === contact.userId;
                const previewText = directMessagePreviews[contact.userId] ?? "No messages yet";
                return (
                  <div
                    key={contact.userId}
                    onClick={() => {
                      onSelectPeer(contact.userId);
                      closeSidebarOnMobile();
                    }}
                    className={`group relative flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors ${
                      isActive ? "bg-[#2b5278]" : "hover:bg-[#202b36]"
                    }`}
                  >
                    <div
                      className={`flex size-[54px] shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white ${avatarColorClass(
                        contact.userId
                      )}`}
                    >
                      {initials(contactName(contact))}
                    </div>
                    <div className="min-w-0 flex-1 py-1">
                      <div className="flex justify-between items-baseline">
                        <span className={`truncate text-[16px] font-semibold ${isActive ? "text-white" : TG_COLORS.textPrimary}`}>
                          {contactName(contact)}
                        </span>
                        <div className="flex items-center gap-1">
                           <span className={`text-xs ${isActive ? "text-[#a2c5e6]" : "text-[#6c7883]"}`}>
                             {formatClock(contact.addedAt)}
                            </span>
                        </div>
                      </div>
                      <p className={`truncate text-[15px] ${isActive ? "text-[#dceafb]" : "text-[#7f91a4]"}`}>
                        {previewText}
                        {contact.hasKeyMismatch && <span className="text-red-400"> • Identity changed!</span>}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="mt-10 px-6 text-center">
                <p className={TG_COLORS.textSecondary}>No contacts yet.</p>
                <p className="mt-1 text-xs text-[#5d6d7e]">Add a user ID to start chatting.</p>
              </div>
            )
          ) : filteredGroups.length > 0 ? (
            filteredGroups.map((group) => {
              const isActive = selectedGroupId === group.groupId;
              const previewText = groupMessagePreviews[group.groupId] ?? "No messages yet";
              return (
                <div
                  key={group.groupId}
                  onClick={() => {
                    onSelectGroup(group.groupId);
                    closeSidebarOnMobile();
                  }}
                  className={`group relative flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors ${
                    isActive ? "bg-[#2b5278]" : "hover:bg-[#202b36]"
                  }`}
                >
                  <div
                    className={`flex size-[54px] shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white ${avatarColorClass(
                      group.name
                    )}`}
                  >
                    {initials(group.name)}
                  </div>
                  <div className="min-w-0 flex-1 py-1">
                    <div className="flex justify-between items-baseline">
                      <span className={`truncate text-[16px] font-semibold ${isActive ? "text-white" : TG_COLORS.textPrimary}`}>
                        {group.name}
                      </span>
                      <span className={`text-xs ${isActive ? "text-[#a2c5e6]" : "text-[#6c7883]"}`}>
                        {formatClock(group.createdAt)}
                      </span>
                    </div>
                    <p className={`truncate text-[15px] ${isActive ? "text-[#dceafb]" : "text-[#7f91a4]"}`}>
                      <span className={`${isActive ? "text-white" : "text-[#e5e5e5]"}`}>{group.role}:</span> {previewText}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="mt-10 px-6 text-center">
              <p className={TG_COLORS.textSecondary}>No groups yet.</p>
            </div>
          )}
        </div>
        
        {/* Fab / Add Button Area - Styled more subtly at bottom */}
        <div className="p-3 bg-[#17212b]">
           {activeView === "direct" ? (
             <div className="relative">
                <input
                  className={inputClassName()}
                  value={contactInput}
                  onChange={(event) => onContactInputChange(event.target.value)}
                  placeholder="Enter User ID to add..."
                />
                <Button
                  size="icon"
                  className="absolute right-1 top-1 h-7 w-7 rounded-full bg-[#5288c1] hover:bg-[#4a7ab0]"
                  onClick={() => void onAddContact()}
                  disabled={!contactInput.trim()}
                >
                  <Users className="size-4 text-white" />
                </Button>
             </div>
           ) : (
             <div className="space-y-2">
                {selectedGroupId === null ? (
                  <>
                    <input
                      className={inputClassName()}
                      value={groupNameInput}
                      onChange={(event) => onGroupNameInputChange(event.target.value)}
                      placeholder="New Group Name"
                    />
                    <input
                      className={inputClassName()}
                      value={groupMembersInput}
                      onChange={(event) => onGroupMembersInputChange(event.target.value)}
                      placeholder="Member IDs (comma separated)"
                    />
                    <Button
                      className="w-full bg-[#5288c1] hover:bg-[#4a7ab0]"
                      onClick={() => void onCreateGroup()}
                      disabled={!groupNameInput.trim()}
                    >
                      Create Group
                    </Button>
                  </>
                ) : (
                  <>
                    <input
                      className={inputClassName()}
                      value={addMembersInput}
                      onChange={(event) => onAddMembersInputChange(event.target.value)}
                      placeholder="Add member IDs (comma separated)"
                    />
                    <Button
                      className="w-full bg-[#5288c1] hover:bg-[#4a7ab0]"
                      onClick={() => void onAddMembers()}
                      disabled={!addMembersInput.trim()}
                    >
                      Add Members
                    </Button>
                  </>
                )}
             </div>
           )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <section className={`flex flex-1 flex-col ${TG_COLORS.bgMain} min-w-0 relative`}>
        {/* Chat Background Pattern */}
        <div 
           className="absolute inset-0 pointer-events-none opacity-[0.08]"
           style={{
             backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239b9b9b' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
           }} 
        />

        {/* Chat Header */}
        <header className={`flex items-center justify-between border-b ${TG_COLORS.border} ${TG_COLORS.bgHeader} px-4 py-2 z-10 shadow-sm shrink-0 h-[56px]`}>
           <div className="flex items-center gap-4">
             <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-[#707579]"
                onClick={() => setIsSidebarOpen(true)}
             >
                <ArrowLeft className="size-5" />
             </Button>
             <div className="flex items-center gap-3 cursor-pointer">
               {/* Avatar */}
               <div className={`flex size-[42px] items-center justify-center rounded-full text-lg font-semibold text-white ${
                 activeView === "direct" 
                  ? avatarColorClass(selectedContact?.handle || selectedPeerUserId || "?") 
                  : avatarColorClass(selectedGroup?.name || "?")
               }`}>
                  {activeView === "direct"
                    ? initials(selectedContact?.displayName || "U")
                    : initials(selectedGroup?.name || "?")}
               </div>
               
               {/* Name & Status */}
               <div className="flex flex-col justify-center">
                  <h2 className={`text-[16px] font-bold leading-tight ${TG_COLORS.textPrimary}`}>
                    {activeView === "direct"
                      ? (selectedContact ? contactName(selectedContact) : "Select a Chat")
                      : (selectedGroup?.name || "Select a Group")
                    }
                  </h2>
                  <p className={`text-[13px] leading-tight ${TG_COLORS.textSecondary}`}>
                    {activeView === "direct" 
                      ? (selectedContact
                        ? `${contactHandle(selectedContact)}${selectedContact.hasKeyMismatch ? " • ⚠ Identity mismatch" : ""}`
                        : "No active chat")
                      : (selectedGroup ? `${groupMessages.length} messages` : "")
                    }
                  </p>
                  {latestPinnedMessage ? (
                    <button
                      type="button"
                      className="mt-0.5 inline-flex items-center gap-1 text-left text-[12px] leading-tight text-[#5f7f9e] transition hover:text-[#89b4de]"
                      onClick={() => jumpToPinnedMessage()}
                    >
                      <Pin className="size-3" />
                      Pinned: {(latestPinnedMessage.body || "[message deleted]").slice(0, 60)}
                    </button>
                  ) : null}
                 </div>
               </div>
             </div>

           <div className="flex items-center gap-1 text-[#707579]">
              {selectionMode ? (
                <>
                  <span className="rounded-full bg-[#2b5278] px-3 py-1.5 text-xs text-white">
                    {selectedMessageIds.size} selected
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-[#2f4457] text-[#f5f5f5] w-10 h-10 rounded-full"
                    onClick={() => void deleteSelectedMessages()}
                    disabled={selectedMessageIds.size === 0 || isDeletingMessages}
                  >
                    <Trash className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-[#2b2d31] text-[#f5f5f5] w-10 h-10 rounded-full"
                    onClick={clearMessageSelection}
                  >
                    <X className="size-4" />
                  </Button>
                </>
              ) : null}

              {showSearch ? (
                 <div className="flex items-center gap-2 bg-[#242f3d] rounded-full pl-3 pr-1 py-1 mr-2 animate-in slide-in-from-right-4 fade-in duration-200">
                    <input 
                      autoFocus
                      className="bg-transparent border-none outline-none text-[#f5f5f5] text-sm w-32 md:w-48 placeholder:text-[#7f91a4]"
                      placeholder="Find in chat..."
                      value={chatSearchTerm}
                      onChange={(e) => setChatSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (!chatSearchMatches.length) {
                          return;
                        }

                        if (e.key === "Enter") {
                          e.preventDefault();
                          jumpToSearchMatch(activeSearchMatchIndex + 1);
                        }

                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          jumpToSearchMatch(activeSearchMatchIndex - 1);
                        }

                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          jumpToSearchMatch(activeSearchMatchIndex + 1);
                        }
                      }}
                    />
                    {showSearch && chatSearchMatches.length > 0 ? (
                      <span className="rounded-full bg-[#1f2f3f] px-2 py-0.5 text-[11px] text-[#a5d1f5]">
                        {activeSearchMatchIndex + 1}/{chatSearchMatches.length}
                      </span>
                    ) : null}
                    {chatSearchMatches.length > 0 ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-[#7f91a4] hover:text-[#f5f5f5]"
                          onClick={() => jumpToSearchMatch(activeSearchMatchIndex - 1)}
                        >
                          <ChevronLeft className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-[#7f91a4] hover:text-[#f5f5f5]"
                          onClick={() => jumpToSearchMatch(activeSearchMatchIndex + 1)}
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                      </>
                    ) : null}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 rounded-full hover:bg-[#17212b] text-[#707579]"
                      onClick={() => {
                        setShowSearch(false);
                        setChatSearchTerm("");
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                 </div>
              ) : (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="hover:bg-[#2b2d31] w-10 h-10 rounded-full"
                  onClick={() => setShowSearch(true)}
                >
                  <Search className="size-5" />
                </Button>
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-[#2b2d31] w-10 h-10 rounded-full data-[state=open]:bg-[#2b2d31] data-[state=open]:text-[#f5f5f5]"
                  >
                    <MoreVertical className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  collisionPadding={12}
                  className="z-[70] w-56 border-[#0e1621] bg-[#242f3d] p-1 text-[#f5f5f5]"
                >
                  <DropdownMenuItem
                    disabled={!hasActiveChat}
                    className="text-[15px] text-[#f5f5f5] focus:bg-[#17212b] focus:text-[#f5f5f5] data-[disabled]:text-[#5d778f]"
                    onSelect={() => {
                      if (!showProfileSheet && hasActiveChat) {
                        setShowProfileSheet(true);
                      }
                    }}
                  >
                    <Users className="size-4 text-[#7f91a4]" />
                    View Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-[15px] text-[#f5f5f5] focus:bg-[#17212b] focus:text-[#f5f5f5]"
                    onSelect={() => {
                      if (selectionMode) {
                        clearMessageSelection();
                        return;
                      }
                      clearMessageSelection();
                      setSelectionMode(true);
                    }}
                  >
                    <CheckCheck className="size-4 text-[#7f91a4]" />
                    {selectionMode ? "Cancel Selection" : "Select Messages"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-[#0e1621]" />
                  <DropdownMenuItem
                    disabled={!hasActiveChat || isDeletingMessages}
                    className="text-[15px] text-[#ff5959] focus:bg-[#2f1f1f] focus:text-[#ff5959] data-[disabled]:text-[#5d778f]"
                    onSelect={() => {
                      void deleteCurrentConversation();
                    }}
                  >
                    <Trash className="size-4" />
                    Delete Chat
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
           </div>
        </header>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto px-2 py-4 md:px-4 z-0 custom-scrollbar">
          {((activeView === "direct" && directMessages.length === 0) || (activeView === "group" && groupMessages.length === 0)) && (
             <div className="flex h-full flex-col items-center justify-center text-center opacity-70">
                <div className="rounded-full bg-[#182533] p-8 mb-6 animate-in zoom-in duration-300">
                  <div className="bg-[#2b5278] rounded-full p-4">
                     <SendHorizontal className="size-10 text-white" />
                  </div>
                </div>
                <p className={`${TG_COLORS.textPrimary} text-lg font-medium`}>No messages here yet...</p>
                <p className={`${TG_COLORS.textSecondary} text-sm mt-1`}>Send a message to start the conversation.</p>
             </div>
          )}

          {activeView === "direct" && displayDirectMessages.map((msg, idx) => {
            const isOut = msg.direction === "out";
            const prev = displayDirectMessages[idx - 1];
            const showDate = !prev || !isSameDay(prev.createdAt, msg.createdAt);
            const messageId = msg.id;
            const canSelect = typeof messageId === "number";
            const selected = canSelect ? selectedMessageIds.has(messageId) : false;
            const replyDraftCandidate = buildReplyDraftFromDirectMessage(msg);
            const canEdit = isOut && !msg.isDeletedForEveryone;
            const canDelete = isOut && !msg.isDeletedForEveryone;
            const isDeleted = msg.isDeletedForEveryone === true;

            return (
              <div key={messageId ?? `direct-${idx}`} className="flex flex-col">
                {showDate && (
                  <div className="sticky top-2 z-10 flex justify-center my-2 pointer-events-none">
                    <span className="rounded-full bg-[#000000]/40 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm shadow-sm">
                      {formatDatePill(msg.createdAt)}
                    </span>
                  </div>
                )}
                <div className={`flex w-full items-end mb-1 ${isOut ? "justify-end" : "justify-start"} ${selectionMode ? "gap-2" : ""}`}>
                  {selectionMode && canSelect ? (
                    <button
                      type="button"
                      className={`mb-[2px] inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                        selected
                          ? "border-[#6ab2f2] bg-[#6ab2f2] text-[#0e1621]"
                          : "border-[#6d7e92] text-transparent hover:border-[#7faad5]"
                      }`}
                      onClick={() => toggleMessageSelection(messageId)}
                    >
                      {selected ? <CheckCheck className="size-3" /> : <Circle className="size-3" />}
                    </button>
                  ) : null}
                  <div
                        ref={getMessageNodeRef(messageId)}
                        className={`relative max-w-[480px] min-w-[120px] rounded-2xl border pl-3 pr-16 pt-[6px] pb-5 shadow-sm group ${
                          isOut
                            ? `${TG_COLORS.bgBubbleSent} rounded-br-md ${isDeleted ? "border-[#2f445b]" : "border-transparent"}`
                            : `${TG_COLORS.bgBubbleRecv} rounded-bl-md ${isDeleted ? "border-[#2f445b]" : "border-transparent"}`
                        } ${
                          highlightedMessageId === messageId
                            ? "ring-2 ring-[#89b7dc] shadow-[0_0_0_2px_rgba(137,183,220,0.25)]"
                            : ""
                        }`}
                      >
                    {msg.isPinned ? (
                      <span className="mb-1 inline-flex items-center gap-1 text-[11px] text-[#9ec2e8]">
                        <Pin className="size-3" />
                        Pinned
                      </span>
                    ) : null}
                    {renderReplyPreview(msg, jumpToReplyTarget)}
                    <p
                      className={`text-[16px] leading-snug whitespace-pre-wrap break-words ${
                        isDeleted ? "italic text-[#95a8bc]" : TG_COLORS.textPrimary
                      } pb-4 pr-10`}
                    >
                      {msg.body ? renderMessageTextWithSearchMatch(msg.body) : "[message deleted]"}
                    </p>
                    {renderMessageAttachmentPreviews(msg)}
                    {selectionMode ? null : (
                      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                        {renderMessageActionMenu({
                          messageId,
                          body: msg.body,
                          clientMsgId: msg.clientMsgId,
                          isPinned: msg.isPinned,
                          canEdit,
                          canDelete,
                          onReply: () => {
                            const next = buildReplyDraftFromDirectMessage(msg);
                            if (next) {
                              setReplyDraft(next);
                            }
                          },
                          onEdit: () => {
                            if (canEdit) {
                              startEditingDirectMessage(msg);
                            }
                          },
                          onForward: () => {
                            void handleForwardMessage(msg);
                          },
                        })}
                        {replyDraftCandidate ? (
                          <button
                            className="rounded-full bg-black/30 p-1 text-[#9ec0df] transition hover:text-white"
                            onClick={() => setReplyDraft(replyDraftCandidate)}
                            title="Reply"
                          >
                            <CornerDownLeft className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    )}

                    <div className="absolute right-2 bottom-1 flex items-center gap-1 select-none">
                      <span className={`text-[11px] ${isOut ? "text-[#7faad5]" : "text-[#5d7389]"}`}>
                        {formatClock(msg.createdAt)}
                        {msg.editedAt && <span className="ml-1 text-[10px] text-[#8ea7c4]">· edited</span>}
                      </span>
                      {isOut && <CheckCheck className="size-3 text-[#7faad5]" />}
                    </div>
                  </div>
                </div>
                {selectionMode ? null : renderReactionRow(msg, isOut)}
              </div>
            );
          })}

          {activeView === "group" && displayGroupMessages.map((msg, idx) => {
             const isOut = msg.fromUserId === identityUserId;
             const prev = displayGroupMessages[idx - 1];
             const showDate = !prev || !isSameDay(prev.createdAt, msg.createdAt);
             const messageId = msg.id;
             const canSelect = typeof messageId === "number";
             const selected = canSelect ? selectedMessageIds.has(messageId) : false;
             const replyDraftCandidate = buildReplyDraftFromGroupMessage(msg);
             const canEdit = isOut && !msg.isDeletedForEveryone;
             const canDelete = isOut && !msg.isDeletedForEveryone;
             const isDeleted = msg.isDeletedForEveryone === true;

             return (
               <div key={messageId ?? `group-${idx}`} className="flex flex-col">
                 {showDate && (
                  <div className="sticky top-2 z-10 flex justify-center my-2 pointer-events-none">
                     <span className="rounded-full bg-[#000000]/40 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm shadow-sm">
                        {formatDatePill(msg.createdAt)}
                     </span>
                  </div>
                )}
                 <div className={`flex w-full items-start gap-2 mb-1 ${isOut ? "justify-end" : "justify-start"}`}>
                    {selectionMode && canSelect ? (
                      <button
                        type="button"
                        className={`mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                          selected
                            ? "border-[#6ab2f2] bg-[#6ab2f2] text-[#0e1621]"
                            : "border-[#6d7e92] text-transparent hover:border-[#7faad5]"
                        }`}
                        onClick={() => toggleMessageSelection(messageId)}
                      >
                        {selected ? <CheckCheck className="size-3" /> : <Circle className="size-3" />}
                      </button>
                    ) : null}
                    {!isOut && (
                      <div className={`size-[38px] shrink-0 rounded-full text-sm flex items-center justify-center font-bold text-white mb-1 ${avatarColorClass(msg.fromUserId)}`}>
                         {initials(msg.fromUserId)}
                      </div>
                    )}
                    <div
                      ref={getMessageNodeRef(messageId)}
                      className={`relative max-w-[480px] min-w-[120px] rounded-2xl border pl-3 pr-16 pt-[6px] pb-5 shadow-sm group ${
                        isOut
                          ? `${TG_COLORS.bgBubbleSent} rounded-br-md ${isDeleted ? "border-[#2f445b]" : "border-transparent"}`
                          : `${TG_COLORS.bgBubbleRecv} rounded-bl-md ${isDeleted ? "border-[#2f445b]" : "border-transparent"}`
                      } ${
                        highlightedMessageId === messageId
                          ? "ring-2 ring-[#89b7dc] shadow-[0_0_0_2px_rgba(137,183,220,0.25)]"
                          : ""
                      }`}
                    >
                      {msg.isPinned ? (
                        <span className="mb-1 inline-flex items-center gap-1 text-[11px] text-[#9ec2e8]">
                          <Pin className="size-3" />
                          Pinned
                        </span>
                      ) : null}
                      {!isOut && (
                        <p
                          className={`mb-1 text-[13px] font-bold cursor-pointer hover:underline ${avatarColorClass(msg.fromUserId).replace("bg-", "text-")}`}
                        >
                           {msg.fromUserId.slice(0, 10)}
                        </p>
                      )}
                      {renderReplyPreview(msg, jumpToReplyTarget)}
                      <p className={`text-[16px] leading-snug whitespace-pre-wrap break-words ${
                        isDeleted ? "italic text-[#95a8bc]" : TG_COLORS.textPrimary
                      } pb-4 pr-10`}>
                        {msg.body ? renderMessageTextWithSearchMatch(msg.body) : "[message deleted]"}
                      </p>
                      {renderMessageAttachmentPreviews(msg)}
                      {selectionMode ? null : (
                        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                          {renderMessageActionMenu({
                            messageId,
                            body: msg.body,
                            clientMsgId: msg.clientMsgId,
                            isPinned: msg.isPinned,
                            canEdit,
                            canDelete,
                            onReply: () => {
                              const next = buildReplyDraftFromGroupMessage(msg);
                              if (next) {
                                setReplyDraft(next);
                              }
                            },
                            onEdit: () => {
                              if (canEdit) {
                                startEditingGroupMessage(msg);
                              }
                            },
                            onForward: () => {
                              void handleForwardMessage(msg);
                            },
                          })}
                          {replyDraftCandidate ? (
                            <button
                              className="rounded-full bg-black/30 p-1 text-[#9ec0df] transition hover:text-white"
                              onClick={() => setReplyDraft(replyDraftCandidate)}
                              title="Reply"
                            >
                              <CornerDownLeft className="size-3.5" />
                            </button>
                          ) : null}
                        </div>
                      )}

                      <div className="absolute right-2 bottom-1 flex items-center gap-1 select-none">
                        <span className={`text-[11px] ${isOut ? "text-[#7faad5]" : "text-[#5d7389]"}`}>
                          {formatClock(msg.createdAt)}
                          {msg.editedAt && <span className="ml-1 text-[10px] text-[#8ea7c4]">· edited</span>}
                        </span>
                      </div>
                    </div>
                 </div>
                  {selectionMode ? null : renderReactionRow(msg, isOut)}
               </div>
             );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <footer className={`flex flex-col border-t ${TG_COLORS.border} ${TG_COLORS.bgHeader} px-2 py-2 shrink-0`}>
          {editingDraft ? (
            <div className="mb-2 rounded-xl border border-[#364d64] bg-[#1f3c57] px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wide text-[#9ec0e0]">Editing {editingDraft.sender}</p>
                  <p className="truncate text-[#d7ebff]">{editingDraft.text}</p>
                </div>
                <button
                  type="button"
                  className="rounded-full bg-[#2b5278] px-2.5 py-1 text-[11px] text-white hover:bg-[#4a7ab0]"
                  onClick={() => void handleSaveEdit()}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="rounded-full px-2.5 py-1 text-[11px] text-[#d7ebff] hover:bg-[#2b3f52]"
                  onClick={stopEditing}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {replyDraft ? (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#30445f] bg-[#1f3c57] px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-[#9ec0e0]">Replying to {replyDraft.sender}</p>
                <p className="truncate text-[#d7ebff]">{replyDraft.text}</p>
              </div>
              <button
                type="button"
                className="rounded-full p-1 text-[#9ec0e0] transition hover:text-white hover:bg-[#2f4764]"
                onClick={() => setReplyDraft(null)}
                title="Cancel reply"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : null}

          {/* Attachment Preview */}
          {attachments.length > 0 && (
             <div className="flex gap-2 pb-2 overflow-x-auto">
               {attachments.map((file, idx) => (
                  <div key={idx} className="relative group bg-[#17212b] rounded-md p-2 flex items-center gap-2 min-w-[120px]">
                     {file.type.startsWith('image/') ? (
                        <ImageIcon className="size-8 text-[#6ab2f2]" />
                     ) : (
                        <FileText className="size-8 text-[#6ab2f2]" />
                     )}
                     <div className="flex-1 overflow-hidden">
                       <p className="text-xs text-[#f5f5f5] truncate max-w-[100px]" title={file.name}>
                         {truncateFileName(file.name, 24)}
                       </p>
                       <p className="text-[10px] text-[#7f91a4]">{formatAttachmentSizeLabel(file.size)}</p>
                     </div>
                     <button 
                       onClick={() => removeAttachment(idx)}
                       className="absolute -top-1 -right-1 bg-[#2b2d31] rounded-full p-0.5 text-[#f5f5f5] hover:bg-[#ff5959]"
                     >
                       <X className="size-3" />
                     </button>
                  </div>
               ))}
             </div>
          )}

          <div className="flex items-end gap-2">
            <div className="relative">
              <input 
                type="file" 
                multiple 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileSelect}
              />
              <Button 
                variant="ghost" 
                size="icon" 
                className={`shrink-0 text-[#707579] hover:bg-[#2b2d31] hover:text-[#f5f5f5] w-12 h-12 rounded-full ${attachments.length > 0 ? "text-[#6ab2f2]" : ""}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="size-6" />
              </Button>
            </div>
          
            <div className="relative flex-1">
              <input
                className={`w-full rounded-2xl border-none ${TG_COLORS.bgMain} py-3 pl-4 pr-10 text-[16px] ${TG_COLORS.textPrimary} outline-none placeholder:text-[#707579]`}
                placeholder="Write a message..."
                value={messageInput}
                onChange={(e) => onMessageInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendWithAttachments();
                  }
                }}
              />
              <button 
                className={`absolute right-3 top-3 transition-colors ${showEmojiPicker ? "text-[#6ab2f2]" : "text-[#707579] hover:text-[#f5f5f5]"}`}
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              >
                 <Smile className="size-6" />
              </button>
              
              {/* Emoji Picker Popover */}
              {showEmojiPicker && (
                <div className="absolute bottom-14 right-0 z-50 animate-in slide-in-from-bottom-2 duration-200">
                  <div className="shadow-2xl rounded-xl overflow-hidden border border-[#0e1621]">
                    <EmojiPicker 
                      onEmojiClick={onEmojiClick}
                      theme={"dark" as any}
                      searchDisabled={false}
                      width={320}
                      height={400}
                      previewConfig={{ showPreview: false }}
                    />
                  </div>
                </div>
              )}
            </div>

            <Button
              disabled={!canDispatch}
              className="size-12 rounded-full bg-[#5288c1] p-0 text-white hover:bg-[#4a7ab0] shrink-0 transition-transform active:scale-95 shadow-md disabled:bg-[#2b3d50] disabled:text-[#7f91a4] disabled:shadow-none disabled:active:scale-100"
              onClick={() => void handleSendWithAttachments()}
            >
              <SendHorizontal className="size-6 ml-1" />
            </Button>
          </div>

          {attachmentInputError && (
            <p className="px-2 pt-2 text-xs text-[#ffb89d]">{attachmentInputError}</p>
          )}
          {status !== "idle" && (
            <p className={`px-2 pt-2 text-xs ${status.startsWith("error:") ? "text-[#ff9db0]" : "text-[#7f91a4]"}`}>
              {status}
            </p>
          )}
        </footer>
      </section>

      {showAccountSheet && (
        <>
          <div className="fixed inset-0 z-40 bg-black/45" onClick={() => setShowAccountSheet(false)} />
          <aside className="fixed left-0 top-0 z-50 h-full w-full max-w-md border-r border-[#0e1621] bg-[#17212b] p-4 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-[#9ab1c6] hover:bg-[#203244] hover:text-white"
                  onClick={() => setShowAccountSheet(false)}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <h3 className="text-lg font-semibold text-[#f5f5f5]">My Account</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-[#9ab1c6] hover:bg-[#203244] hover:text-white"
                onClick={() => setShowAccountSheet(false)}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="rounded-2xl bg-[#1f2c3a] p-5">
              <div className="mb-5 flex items-center gap-4">
                <div className={`flex size-14 items-center justify-center rounded-full text-xl font-semibold text-white ${avatarColorClass(identityUserId)}`}>
                  {initials(userProfile.displayName)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xl font-semibold text-[#f5f5f5]">{userProfile.displayName}</p>
                  <p className="truncate text-sm text-[#85aad0]">{formatHandle(userProfile.handle)}</p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="rounded-xl bg-[#152433] p-3">
                  <p className="mb-1 text-xs uppercase tracking-wide text-[#7f91a4]">User ID</p>
                  <p className="break-all font-mono text-[12px] text-[#d2e7fb]">{identityUserId}</p>
                  <button
                    className="mt-2 inline-flex items-center gap-1 rounded-md bg-[#2b5278] px-2 py-1 text-xs text-white hover:bg-[#38638c]"
                    onClick={() => void handleCopyUserId()}
                  >
                    <Copy className="size-3.5" />
                    {copyState === "copied" ? "Copied" : copyState === "failed" ? "Retry Copy" : "Copy ID"}
                  </button>
                </div>

                <div className="rounded-xl bg-[#152433] p-3">
                  <p className="mb-1 text-xs uppercase tracking-wide text-[#7f91a4]">About</p>
                  <p className="text-[#d2e7fb]">{userProfile.about || "No bio yet."}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-[#152433] p-3">
                    <p className="mb-1 text-xs uppercase tracking-wide text-[#7f91a4]">Device</p>
                    <p className="text-[#d2e7fb]">#{deviceId}</p>
                  </div>
                  <div className="rounded-xl bg-[#152433] p-3">
                    <p className="mb-1 text-xs uppercase tracking-wide text-[#7f91a4]">Status</p>
                    <p className="truncate text-[#d2e7fb]">{status || "idle"}</p>
                  </div>
                </div>

                <div className="rounded-xl bg-[#152433] p-3">
                  <p className="mb-1 text-xs uppercase tracking-wide text-[#7f91a4]">Safety Number</p>
                  <p className="break-all font-mono text-[11px] text-[#9fc4e5]">
                    {safetyNumber ? `${safetyNumber.slice(0, 80)}...` : "Open a private chat to verify."}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}

      {showProfileSheet && (
        <>
          <div className="fixed inset-0 z-40 bg-black/45" onClick={() => setShowProfileSheet(false)} />
          <aside className="fixed left-0 top-0 z-50 h-full w-full max-w-md border-r border-[#0e1621] bg-[#17212b] p-4 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-[#9ab1c6] hover:bg-[#203244] hover:text-white"
                  onClick={() => setShowProfileSheet(false)}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <h3 className="text-lg font-semibold text-[#f5f5f5]">Profile</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-[#9ab1c6] hover:bg-[#203244] hover:text-white"
                onClick={() => setShowProfileSheet(false)}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="rounded-2xl bg-[#1f2c3a] p-5 space-y-3">
              {activeView === "direct" && selectedContact ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className={`flex size-12 items-center justify-center rounded-full text-lg font-semibold text-white ${avatarColorClass(selectedContact?.handle || selectedPeerUserId || "?")}`}>
                      {initials(contactName(selectedContact))}
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-[#f5f5f5]">{contactName(selectedContact)}</p>
                      <p className="text-sm text-[#7f91a4]">{contactHandle(selectedContact)}</p>
                    </div>
                  </div>
                  <button
                    className="w-full rounded-lg bg-[#2b5278] px-2 py-2 text-xs text-white hover:bg-[#38638c]"
                    onClick={() => void handleCopyValue(selectedContact.userId)}
                  >
                    <Copy className="inline mr-1 size-3.5" />
                    {copyState === "copied" ? "Copied peer ID" : copyState === "failed" ? "Retry copy" : "Copy peer ID"}
                  </button>
                  <p className="rounded-xl bg-[#152433] p-3 text-sm text-[#d2e7fb]">
                    Direct chat profile preview is based on local contact metadata.
                  </p>
                </>
              ) : activeView === "group" && selectedGroup ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className={`flex size-12 items-center justify-center rounded-full text-lg font-semibold text-white ${avatarColorClass(selectedGroup?.name || "?")}`}>
                      {initials(selectedGroup.name)}
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-[#f5f5f5]">{selectedGroup.name}</p>
                      <p className="text-sm text-[#7f91a4]">
                        {selectedGroup.role} · Group #{selectedGroup.groupId}
                      </p>
                  </div>
                  </div>
                  <div className="rounded-xl bg-[#152433] p-3 text-sm text-[#d2e7fb]">
                    <p className="mb-1 text-xs uppercase tracking-wide text-[#7f91a4]">Group ID</p>
                    <p className="break-all">{selectedGroup.groupId}</p>
                  </div>
                  <button
                    className="w-full rounded-lg bg-[#2b5278] px-2 py-2 text-xs text-white hover:bg-[#38638c]"
                    onClick={() => void handleCopyValue(String(selectedGroup.groupId))}
                  >
                    <Copy className="inline mr-1 size-3.5" />
                    {copyState === "copied" ? "Copied group ID" : copyState === "failed" ? "Retry copy" : "Copy group ID"}
                  </button>
                  <button
                    className="w-full rounded-lg border border-[#2b5278] px-2 py-2 text-xs text-[#d2e7fb] hover:bg-[#2b2d31]"
                    onClick={() => void handleCopyValue(selectedGroup.createdByUserId)}
                  >
                    <Copy className="inline mr-1 size-3.5" />
                    Copy creator ID
                  </button>
                </>
              ) : (
                <p className="text-sm text-[#d2e7fb]">Select a chat to view its profile details.</p>
              )}
            </div>
          </aside>
        </>
      )}

      {showSettingsSheet && (
        <>
          <div className="fixed inset-0 z-40 bg-black/45" onClick={() => setShowSettingsSheet(false)} />
          <aside className="fixed left-0 top-0 z-50 h-full w-full max-w-md border-r border-[#0e1621] bg-[#17212b] p-4 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-[#9ab1c6] hover:bg-[#203244] hover:text-white"
                  onClick={() => setShowSettingsSheet(false)}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <h3 className="text-lg font-semibold text-[#f5f5f5]">Settings</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-[#9ab1c6] hover:bg-[#203244] hover:text-white"
                onClick={() => setShowSettingsSheet(false)}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="space-y-4 rounded-2xl bg-[#1f2c3a] p-5">
              <label className="block">
                <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-[#7f91a4]">
                  <UserRound className="size-3.5" />
                  Display Name
                </span>
                <input
                  className={inputClassName()}
                  value={settingsDraft.displayName}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  placeholder="Display name"
                  maxLength={40}
                />
              </label>

              <label className="block">
                <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-[#7f91a4]">
                  <AtSign className="size-3.5" />
                  Handle
                </span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#7f91a4]">@</span>
                  <input
                    className={`${inputClassName()} pl-7`}
                    value={settingsDraft.handle}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        handle: event.target.value.replace(/^@+/, ""),
                      }))
                    }
                    placeholder="your_handle"
                    maxLength={24}
                  />
                </div>
                <p className="mt-1 text-xs text-[#7f91a4]">3-24 chars, use a-z, 0-9, _</p>
              </label>

              <label className="block">
                <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-[#7f91a4]">
                  <BadgeInfo className="size-3.5" />
                  About
                </span>
                <textarea
                  className={`${inputClassName()} min-h-[100px] resize-none`}
                  value={settingsDraft.about}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      about: event.target.value,
                    }))
                  }
                  placeholder="Short bio"
                  maxLength={160}
                />
              </label>

              {settingsError && (
                <p className="rounded-lg bg-[#3a232a] px-3 py-2 text-sm text-[#ffb7c4]">{settingsError}</p>
              )}

              <Button
                className="h-11 w-full rounded-xl bg-[#5288c1] text-white hover:bg-[#4a7ab0]"
                onClick={() => void handleSaveSettings()}
                disabled={isSavingProfile}
              >
                {isSavingProfile ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </aside>
        </>
      )}
    </main>
  );
}
