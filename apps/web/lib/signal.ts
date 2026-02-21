import {
  FingerprintGenerator,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
} from "@privacyresearch/libsignal-protocol-typescript";
import { arrayBufferToBase64, base64ToArrayBuffer } from "./encoding";
import type { IndexedDbSignalStore } from "./storage";

export const DEVICE_ID = 1;

export type SignalBundle = {
  registrationId: number;
  signalIdentityPublicKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKey: {
    keyId: number;
    publicKey: string;
  } | null;
};

function addressFor(userId: string): SignalProtocolAddress {
  return new SignalProtocolAddress(userId, DEVICE_ID);
}

function binaryStringToBase64(binary: string): string {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index) & 0xff;
  }
  return arrayBufferToBase64(bytes.buffer);
}

function base64ToBinaryString(base64: string): string {
  const bytes = new Uint8Array(base64ToArrayBuffer(base64));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return binary;
}

function parseDirectHeader(header: string): { signalType: number; encoding: "binary" | "base64" } {
  try {
    const parsed = JSON.parse(header) as { signalType?: number; encoding?: string };
    return {
      signalType: parsed.signalType ?? 1,
      encoding: parsed.encoding === "base64" ? "base64" : "binary",
    };
  } catch {
    return { signalType: 1, encoding: "binary" };
  }
}

export async function hasOpenSession(store: IndexedDbSignalStore, userId: string): Promise<boolean> {
  const cipher = new SessionCipher(store, addressFor(userId));
  return cipher.hasOpenSession();
}

export async function ensureSession(store: IndexedDbSignalStore, userId: string, bundle: SignalBundle): Promise<void> {
  const sessionBuilder = new SessionBuilder(store, addressFor(userId));
  await sessionBuilder.processPreKey({
    registrationId: bundle.registrationId,
    identityKey: base64ToArrayBuffer(bundle.signalIdentityPublicKey),
    signedPreKey: {
      keyId: bundle.signedPreKey.keyId,
      publicKey: base64ToArrayBuffer(bundle.signedPreKey.publicKey),
      signature: base64ToArrayBuffer(bundle.signedPreKey.signature),
    },
    preKey: bundle.oneTimePreKey
      ? {
          keyId: bundle.oneTimePreKey.keyId,
          publicKey: base64ToArrayBuffer(bundle.oneTimePreKey.publicKey),
        }
      : undefined,
  });
}

export async function encryptDirectPayload(
  store: IndexedDbSignalStore,
  userId: string,
  payload: string,
): Promise<{ ciphertext: string; header: string }> {
  const cipher = new SessionCipher(store, addressFor(userId));
  const encrypted = await cipher.encrypt(new TextEncoder().encode(payload).buffer);
  if (!encrypted.body) {
    throw new Error("signal encryption failed");
  }

  return {
    ciphertext: binaryStringToBase64(encrypted.body),
    header: JSON.stringify({
      signalType: encrypted.type,
      registrationId: encrypted.registrationId,
      encoding: "base64",
      v: 2,
    }),
  };
}

export async function decryptDirectPayload(
  store: IndexedDbSignalStore,
  fromUserId: string,
  ciphertext: string,
  header: string,
): Promise<string> {
  const cipher = new SessionCipher(store, addressFor(fromUserId));
  const parsedHeader = parseDirectHeader(header);
  const signalType = parsedHeader.signalType;
  const payloadBody =
    parsedHeader.encoding === "base64" ? base64ToBinaryString(ciphertext) : ciphertext;

  const plain =
    signalType === 3
      ? await cipher.decryptPreKeyWhisperMessage(payloadBody, "binary")
      : await cipher.decryptWhisperMessage(payloadBody, "binary");

  return new TextDecoder().decode(new Uint8Array(plain));
}

export async function createSafetyNumber(
  localUserId: string,
  localSignalIdentityPublicKey: string,
  remoteUserId: string,
  remoteSignalIdentityPublicKey: string,
): Promise<string> {
  const generator = new FingerprintGenerator(5200);
  return generator.createFor(
    localUserId,
    base64ToArrayBuffer(localSignalIdentityPublicKey),
    remoteUserId,
    base64ToArrayBuffer(remoteSignalIdentityPublicKey),
  );
}

export function createSenderKey(): { keyId: number; keyMaterial: string } {
  const keyMaterial = crypto.getRandomValues(new Uint8Array(32));
  return {
    keyId: Math.floor(Date.now() / 1000),
    keyMaterial: arrayBufferToBase64(keyMaterial.buffer),
  };
}

export async function encryptWithSenderKey(
  keyMaterialBase64: string,
  plainText: string,
  keyId: number,
): Promise<{ ciphertext: string; header: string }> {
  const key = await crypto.subtle.importKey("raw", base64ToArrayBuffer(keyMaterialBase64), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    new TextEncoder().encode(plainText),
  );

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    header: JSON.stringify({ algorithm: "AES-GCM", iv: arrayBufferToBase64(iv.buffer), senderKeyId: keyId, v: 1 }),
  };
}

export async function decryptWithSenderKey(
  keyMaterialBase64: string,
  ciphertextBase64: string,
  header: string,
): Promise<string> {
  const parsed = JSON.parse(header) as { iv: string };
  const key = await crypto.subtle.importKey("raw", base64ToArrayBuffer(keyMaterialBase64), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToArrayBuffer(parsed.iv),
    },
    key,
    base64ToArrayBuffer(ciphertextBase64),
  );

  return new TextDecoder().decode(new Uint8Array(plain));
}
