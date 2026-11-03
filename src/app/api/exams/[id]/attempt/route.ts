import { NextResponse } from "next/server";

import { getMongoUser } from "@/lib/auth";
import { matchesAcademicAudience } from "@/lib/academic-eligibility";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getMongoUser();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Student access is required." }, { status: 403 });
  }

  const { id: examId } = await context.params;
  const exam = await prisma.exam.findFirst({
    where: { id: examId, published: true },
    select: { id: true, durationMins: true, educationLevel: true, grade: true, stream: true },
  });
  if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  if (!matchesAcademicAudience(user, exam)) return NextResponse.json({ error: "This exam is not available for your grade or stream." }, { status: 403 });
  if (!Number.isInteger(exam.durationMins) || exam.durationMins < 1) {
    return NextResponse.json({ error: "This exam has an invalid duration." }, { status: 409 });
  }

  const now = new Date();
  try {
    const attempt = await prisma.examAttempt.upsert({
      where: { examId_userId: { examId, userId: user.id } },
      update: {},
      create: {
        examId,
        userId: user.id,
        startedAt: now,
        expiresAt: new Date(now.getTime() + exam.durationMins * 60_000),
      },
    });

    if (attempt.status !== "IN_PROGRESS") {
      return NextResponse.json({ error: "This exam attempt has already been submitted." }, { status: 409 });
    }
    if (attempt.expiresAt <= now) {
      await prisma.examAttempt.update({ where: { id: attempt.id }, data: { status: "EXPIRED" } });
      return NextResponse.json({ error: "The time for this exam attempt has expired." }, { status: 410 });
    }

    return NextResponse.json({
      expiresAt: attempt.expiresAt.toISOString(),
      durationMins: exam.durationMins,
      remainingSeconds: Math.max(0, Math.ceil((attempt.expiresAt.getTime() - Date.now()) / 1000)),
    });
  } catch (error) {
    console.error("Exam attempt could not be started:", error);
    return NextResponse.json({ error: "This exam could not be started. Please try again." }, { status: 400 });
  }
}
