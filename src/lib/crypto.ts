import crypto from "node:crypto";
import { optionalEnv } from "./config";

export function sha256(value: string | Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString("base64url");
}

export function hashShareToken(token: string) {
  return sha256(`share:${token}`);
}

function shareTokenSecret() {
  const secret =
    optionalEnv("SHARE_TOKEN_ENCRYPTION_SECRET") ??
    optionalEnv("AUTH_SESSION_SECRET") ??
    optionalEnv("ADMIN_SESSION_SECRET") ??
    optionalEnv("BOOTSTRAP_USER_PASSWORD_HASH") ??
    optionalEnv("ADMIN_PASSWORD_HASH");

  if (!secret) {
    throw new Error("SHARE_TOKEN_ENCRYPTION_SECRET or AUTH_SESSION_SECRET is required");
  }

  return secret;
}

function shareTokenEncryptionKey() {
  return crypto.createHash("sha256").update(shareTokenSecret()).digest();
}

export function encryptShareToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", shareTokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptShareToken(tokenCiphertext: string | null) {
  if (!tokenCiphertext) {
    return null;
  }

  const [version, iv, authTag, ciphertext] = tokenCiphertext.split(":");
  if (version !== "v1" || !iv || !authTag || !ciphertext) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      shareTokenEncryptionKey(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(authTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
