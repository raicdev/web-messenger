import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import { authNonces } from "@workspace/db/schema";
import type { AuthEnvelope } from "@workspace/shared";
import { db } from "./db.js";
import { decodeBase64Url } from "./encoding.js";

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

export function deriveUserId(identityPublicKey: string): string {
  return createHash("sha256").update(decodeBase64Url(identityPublicKey)).digest("base64url");
}

export async function assertAuthenticated(
  procedure: string,
  auth: AuthEnvelope,
  payload: Record<string, unknown>,
): Promise<string> {
  const derived = deriveUserId(auth.identityPublicKey);
  if (derived !== auth.userId) {
    throw new Error("auth.userId mismatch");
  }

  const payloadHash = createHash("sha256").update(stableStringify(payload)).digest("base64url");
  const signed = `${procedure}:${auth.nonce}:${payloadHash}`;
  const ok = nacl.sign.detached.verify(
    new TextEncoder().encode(signed),
    decodeBase64Url(auth.signature),
    decodeBase64Url(auth.identityPublicKey),
  );

  if (!ok) {
    throw new Error("invalid signature");
  }

  try {
    await db.insert(authNonces).values({
      nonce: auth.nonce,
      userId: auth.userId,
      createdAt: Date.now(),
    });
  } catch {
    throw new Error("replayed request");
  }

  return auth.userId;
}
