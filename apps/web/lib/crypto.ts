import { KeyHelper } from "@privacyresearch/libsignal-protocol-typescript";
import nacl from "tweetnacl";
import { arrayBufferToBase64, base64ToArrayBuffer, decodeBase64Url, encodeBase64Url } from "./encoding";

export type SignalKeyPairExport = {
  publicKey: string;
  privateKey: string;
};

export type OneTimePreKeyExport = {
  keyId: number;
  publicKey: string;
  privateKey: string;
};

export type LocalIdentity = {
  userId: string;
  authIdentityPublicKey: string;
  authIdentitySecretKey: string;
  signalRegistrationId: number;
  signalIdentityKeyPair: SignalKeyPairExport;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    privateKey: string;
    signature: string;
  };
  oneTimePreKeys: OneTimePreKeyExport[];
};

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return new Uint8Array(digest);
}

export async function deriveUserId(identityPublicKey: string): Promise<string> {
  return encodeBase64Url(await sha256(decodeBase64Url(identityPublicKey)));
}

function stableStringify(input: unknown): string {
  if (input === null || typeof input !== "object") {
    return JSON.stringify(input);
  }
  if (Array.isArray(input)) {
    return `[${input.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, value]) => `${JSON.stringify(key)}:${stableStringify(value)}`).join(",")}}`;
}

export async function signProcedure(
  procedure: string,
  payload: Record<string, unknown>,
  nonce: string,
  identity: LocalIdentity,
): Promise<string> {
  const payloadDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableStringify(payload)));
  const payloadHash = encodeBase64Url(new Uint8Array(payloadDigest));
  const message = `${procedure}:${nonce}:${payloadHash}`;
  const signature = nacl.sign.detached(
    new TextEncoder().encode(message),
    decodeBase64Url(identity.authIdentitySecretKey),
  );
  return encodeBase64Url(signature);
}

export function randomNonce(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(18)));
}

export async function createLocalIdentity(): Promise<{ identity: LocalIdentity; recovery: string }> {
  const authKeyPair = nacl.sign.keyPair();
  const authIdentityPublicKey = encodeBase64Url(authKeyPair.publicKey);

  const signalRegistrationId = KeyHelper.generateRegistrationId();
  const signalIdentity = await KeyHelper.generateIdentityKeyPair();

  const signedPreKeyId = Math.floor(Date.now() / 1000);
  const signedPreKey = await KeyHelper.generateSignedPreKey(signalIdentity, signedPreKeyId);

  const oneTimePreKeys = await Promise.all(
    Array.from({ length: 32 }, async (_, index) => {
      const preKey = await KeyHelper.generatePreKey(index + 1);
      return {
        keyId: preKey.keyId,
        publicKey: arrayBufferToBase64(preKey.keyPair.pubKey),
        privateKey: arrayBufferToBase64(preKey.keyPair.privKey),
      } satisfies OneTimePreKeyExport;
    }),
  );

  const identity: LocalIdentity = {
    userId: await deriveUserId(authIdentityPublicKey),
    authIdentityPublicKey,
    authIdentitySecretKey: encodeBase64Url(authKeyPair.secretKey),
    signalRegistrationId,
    signalIdentityKeyPair: {
      publicKey: arrayBufferToBase64(signalIdentity.pubKey),
      privateKey: arrayBufferToBase64(signalIdentity.privKey),
    },
    signedPreKey: {
      keyId: signedPreKey.keyId,
      publicKey: arrayBufferToBase64(signedPreKey.keyPair.pubKey),
      privateKey: arrayBufferToBase64(signedPreKey.keyPair.privKey),
      signature: arrayBufferToBase64(signedPreKey.signature),
    },
    oneTimePreKeys,
  };

  const recovery = encodeBase64Url(new TextEncoder().encode(JSON.stringify(identity)));
  return { identity, recovery };
}

export async function restoreLocalIdentity(recovery: string): Promise<LocalIdentity> {
  const decoded = new TextDecoder().decode(decodeBase64Url(recovery));
  const restored = JSON.parse(decoded) as LocalIdentity;
  restored.userId = await deriveUserId(restored.authIdentityPublicKey);
  return restored;
}

export function signalKeyPairFromExport(pair: SignalKeyPairExport): { pubKey: ArrayBuffer; privKey: ArrayBuffer } {
  return {
    pubKey: base64ToArrayBuffer(pair.publicKey),
    privKey: base64ToArrayBuffer(pair.privateKey),
  };
}
