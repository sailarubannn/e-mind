import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";

const scrypt = promisify(scryptCallback);
const sessionCookie = "edusmart-session";
const configuredSessionSecret = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === "production" && (!configuredSessionSecret || configuredSessionSecret.length < 32)) {
  throw new Error("SESSION_SECRET must be configured with at least 32 characters in production.");
}
const sessionSecret = configuredSessionSecret ?? "development-only-change-this-secret";
const sessionDurationSeconds = 60 * 60 * 24 * 7;

type SessionPayload = { userId: string; expiresAt: number };

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: "student" | "admin" | "teacher";
  educationLevel: string | null;
  grade: number | null;
  stream: string | null;
  subjects: string[];
};

function toAuthUser(user: { id: string; email: string; fullName: string; role: string; educationLevel: string | null; grade: number | null; stream: string | null; subjects: unknown }): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role.toLowerCase() as AuthUser["role"],
    educationLevel: user.educationLevel,
    grade: user.grade,
    stream: user.stream,
    subjects: Array.isArray(user.subjects) ? user.subjects.filter((subject): subject is string => typeof subject === "string") : [],
  };
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(key, "hex");
  return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
}

function encodeSession(payload: SessionPayload) {
  const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(value).digest("base64url");
  return `${value}.${signature}`;
}

function decodeSession(value: string): SessionPayload | null {
  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) return null;
  const expectedSignature = createHmac("sha256", sessionSecret).update(encodedPayload).digest("base64url");
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString()) as SessionPayload;
    return payload.expiresAt > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie, encodeSession({ userId, expiresAt: Date.now() + sessionDurationSeconds * 1000 }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: sessionDurationSeconds,
    path: "/",
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie, "", { httpOnly: true, expires: new Date(0), path: "/" });
}

export async function getMongoUser() {
  const cookieStore = await cookies();
  const value = cookieStore.get(sessionCookie)?.value;
  const session = value ? decodeSession(value) : null;
  if (!session) return null;

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  return user ? toAuthUser(user) : null;
}
