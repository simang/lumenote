import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env, optionalEnv } from "./config";
import {
  countUsers,
  createUser,
  findUserByEmail,
  findUserById,
  upsertUserByEmail,
} from "./repositories";
import type { User } from "./types";

const sessionCookieName = "lumenote_session";
const legacyAdminCookieName = "lumenote_admin";
const githubInstallStateCookieName = "lumenote_github_install_state";
const sessionTtlSeconds = 60 * 60 * 24 * 14;
const githubInstallStateTtlSeconds = 60 * 10;

type SessionPayload = {
  userId: string;
  email: string;
  exp: number;
};

function sessionSecret() {
  return optionalEnv("ADMIN_SESSION_SECRET") ?? env("ADMIN_PASSWORD_HASH");
}

function sign(value: string) {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function encodeSignedPayload(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeSignedPayload<T>(token: string): T | null {
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

  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
}

function encodeSession(payload: SessionPayload) {
  return encodeSignedPayload(payload);
}

function decodeSession(token: string): SessionPayload | null {
  const payload = decodeSignedPayload<SessionPayload>(token);
  if (!payload || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

async function bootstrapLegacyAdmin(email: string, password: string) {
  const configuredEmail = optionalEnv("ADMIN_EMAIL");
  const configuredHash = optionalEnv("ADMIN_PASSWORD_HASH");
  if (!configuredEmail || !configuredHash || email.toLowerCase() !== configuredEmail.toLowerCase()) {
    return null;
  }

  if (!(await bcrypt.compare(password, configuredHash))) {
    return null;
  }

  return upsertUserByEmail(email, configuredHash);
}

export async function verifyUserPassword(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);
  if (user && (await bcrypt.compare(password, user.password_hash))) {
    return user;
  }

  return bootstrapLegacyAdmin(normalizedEmail, password);
}

export async function createPasswordUser(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  return createUser(normalizedEmail, passwordHash);
}

export async function publicSignupEnabled() {
  return optionalEnv("ALLOW_PUBLIC_SIGNUP") === "true";
}

export async function createUserSession(user: Pick<User, "id" | "email">) {
  const cookieStore = await cookies();
  const exp = Math.floor(Date.now() / 1000) + sessionTtlSeconds;

  cookieStore.set(sessionCookieName, encodeSession({ userId: user.id, email: user.email, exp }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionTtlSeconds,
  });
}

export async function clearUserSession() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
  cookieStore.delete(legacyAdminCookieName);
  cookieStore.delete(githubInstallStateCookieName);
}

export async function getUserSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) {
    return null;
  }

  try {
    const session = decodeSession(token);
    if (!session) {
      return null;
    }

    const user = await findUserById(session.userId);
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
    };
  } catch {
    return null;
  }
}

export async function requireUser() {
  const session = await getUserSession();
  if (!session) {
    redirect("/admin/login");
  }

  return session;
}

export const requireAdmin = requireUser;

export async function createGitHubInstallState() {
  const cookieStore = await cookies();
  const state = crypto.randomBytes(24).toString("base64url");

  cookieStore.set(githubInstallStateCookieName, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: githubInstallStateTtlSeconds,
  });

  return state;
}

export async function verifyGitHubInstallState(state: string) {
  const cookieStore = await cookies();
  const stored = cookieStore.get(githubInstallStateCookieName)?.value;
  cookieStore.delete(githubInstallStateCookieName);

  if (!stored || !state) {
    return false;
  }

  const storedBytes = Buffer.from(stored);
  const stateBytes = Buffer.from(state);
  return storedBytes.length === stateBytes.length && crypto.timingSafeEqual(storedBytes, stateBytes);
}

export async function userCount() {
  return (await countUsers())?.count ?? 0;
}
