import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";

import { clearSession, createSession, getMongoUser, hashPassword, verifyPassword } from "@/lib/auth";
import { academicLevel, isValidAcademicAudience } from "@/lib/academic-eligibility";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function profileResponse(user: Awaited<ReturnType<typeof getMongoUser>>) {
  if (!user) return null;
  return user;
}

export async function GET() {
  return NextResponse.json({ user: profileResponse(await getMongoUser()) });
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: "signup" | "signin" | "google";
      credential?: string;
      email?: string;
      password?: string;
      fullName?: string;
      mobileNumber?: string;
      educationLevel?: string;
      grade?: number;
      stream?: string;
      subjects?: string[];
    };
    if (body.action === "google") {
      if (!body.credential || !process.env.GOOGLE_CLIENT_ID) {
        return NextResponse.json({ error: "Google sign-in is not configured." }, { status: 503 });
      }

      const ticket = await googleClient.verifyIdToken({ idToken: body.credential, audience: process.env.GOOGLE_CLIENT_ID });
      const googleUser = ticket.getPayload();
      if (!googleUser?.email || !googleUser.email_verified) {
        return NextResponse.json({ error: "Google did not provide a verified email address." }, { status: 401 });
      }

      const email = googleUser.email.toLowerCase();
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          fullName: googleUser.name?.trim() || "Student",
          role: "STUDENT",
        },
      });
      await createSession(user.id);
      return NextResponse.json({ user: profileResponse(await getMongoUser()) });
    }

    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";

    if (!email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

    if (body.action === "signup") {
      const mobileNumber = body.mobileNumber?.trim();
      if (!mobileNumber) return NextResponse.json({ error: "Mobile number is required." }, { status: 400 });
      const educationLevel = body.educationLevel?.trim() ?? "";
      const level = academicLevel(educationLevel);
      const grade = Number(body.grade);
      if (!level || !isValidAcademicAudience(level, grade, body.stream)) {
        return NextResponse.json({ error: "Choose your education level and a valid grade. A/L students must also select their stream." }, { status: 400 });
      }

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(password),
          fullName: body.fullName?.trim() || "Student",
          mobileNumber,
          role: "STUDENT",
          educationLevel,
          grade,
          stream: body.stream?.trim() || null,
          subjects: Array.isArray(body.subjects) ? body.subjects.filter((subject): subject is string => typeof subject === "string") : [],
        },
      });
      await createSession(user.id);
      return NextResponse.json({ user: profileResponse(await getMongoUser()) }, { status: 201 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    await createSession(user.id);
    return NextResponse.json({ user: profileResponse(await getMongoUser()) });
  } catch (error) {
    console.error("Authentication request failed:", error);
    return NextResponse.json({ error: "We could not complete your sign-in. Please try again." }, { status: 500 });
  }
}
