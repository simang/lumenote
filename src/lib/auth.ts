import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env, optionalEnv } from "./config";

const cookieName = "lumenote_admin";
const sessionTtlSeconds = 60 * 60 * 24 * 14;

type SessionPayload = {
  email: string;
  exp: number;
};

function sessionSecret() {
  return optionalEnv("ADMIN_SESSION_SECRET") ?? env("ADMIN_PASSWORD_HASH");
}

function sign(value: string) {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function encodeSession(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeSession(token: string): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  const expected = sign(body);
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    signatureBytes.length !== expectedBytes.length ||
    !crypto.timingSafeEqual(signatureBytes, expectedBytes)
  ) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

export async function verifyAdminPassword(email: string, password: string) {
  const configuredEmail = env("ADMIN_EMAIL");
  if (email !== configuredEmail) {
    return false;
  }

  return bcrypt.compare(password, env("ADMIN_PASSWORD_HASH"));
}

export async function createAdminSession(email: string) {
  const cookieStore = await cookies();
  const exp = Math.floor(Date.now() / 1000) + sessionTtlSeconds;

  cookieStore.set(cookieName, encodeSession({ email, exp }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionTtlSeconds,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) {
    return null;
  }

  try {
    return decodeSession(token);
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return session;
}
