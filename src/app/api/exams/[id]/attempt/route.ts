import { NextResponse } from "next/server";

import { getMongoUser } from "@/lib/auth";
import { matchesAcademicAudience } from "@/lib/academic-eligibility";
import { canRetakeExam } from "@/lib/can-retake-exam";
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
    select: {
      id: true,
      durationMins: true,
      educationLevel: true,
      grade: true,
      stream: true,
      isQuiz: true,
      startsAt: true,
      endsAt: true,
      questions: { select: { type: true } },
    },
  });
  if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  if (!matchesAcademicAudience(user, exam)) return NextResponse.json({ error: "This exam is not available for your grade or stream." }, { status: 403 });
  if (!Number.isInteger(exam.durationMins) || exam.durationMins < 1) {
    return NextResponse.json({ error: "This exam has an invalid duration." }, { status: 409 });
  }

  const now = new Date();
  try {
    await prisma.examAttempt.upsert({
      where: { examId_userId: { examId, userId: user.id } },
      update: {},
      create: {
        examId,
        userId: user.id,
        startedAt: now,
        expiresAt: new Date(now.getTime() + exam.durationMins * 60_000),
      },
    });

    const outcome = await prisma.$transaction(async (transaction) => {
      let attempt = await transaction.examAttempt.findUnique({
        where: { examId_userId: { examId, userId: user.id } },
        include: { result: { select: { obtainedMarks: true, totalMarks: true, percentage: true, passed: true } } },
      });
      if (!attempt) return { type: "missing" as const };

      if (attempt.status === "IN_PROGRESS" && attempt.expiresAt > now) {
        return { type: "ready" as const, attempt };
      }

      if (attempt.status === "IN_PROGRESS") {
        attempt = await transaction.examAttempt.update({
          where: { id: attempt.id },
          data: { status: "EXPIRED" },
          include: { result: { select: { obtainedMarks: true, totalMarks: true, percentage: true, passed: true } } },
        });
      }

      if (!canRetakeExam(exam)) {
        return { type: attempt.status === "EXPIRED" ? "expired" as const : "submitted" as const };
      }

      await transaction.quizAttemptHistory.create({
        data: {
          examId,
          userId: user.id,
          status: attempt.status,
          startedAt: attempt.startedAt,
          submittedAt: attempt.submittedAt,
          expiresAt: attempt.expiresAt,
          obtainedMarks: attempt.result?.obtainedMarks ?? null,
          totalMarks: attempt.result?.totalMarks ?? null,
          percentage: attempt.result?.percentage ?? null,
          passed: attempt.result?.passed ?? null,
          answerFileName: attempt.answerFileName,
          answerMimeType: attempt.answerMimeType,
          answerDocument: attempt.answerDocument,
        },
      });
      await transaction.studentAnswer.deleteMany({ where: { attemptId: attempt.id } });
      await transaction.result.deleteMany({ where: { attemptId: attempt.id } });
      await transaction.examAttempt.delete({ where: { id: attempt.id } });
      const nextAttempt = await transaction.examAttempt.create({
        data: {
          examId,
          userId: user.id,
          startedAt: now,
          expiresAt: new Date(now.getTime() + exam.durationMins * 60_000),
        },
      });
      return { type: "ready" as const, attempt: nextAttempt };
    });

    if (outcome.type === "missing") {
      return NextResponse.json({ error: "This exam attempt could not be found. Please try again." }, { status: 409 });
    }
    if (outcome.type === "expired") {
      return NextResponse.json({ error: "The time for this exam attempt has expired." }, { status: 410 });
    }
    if (outcome.type === "submitted") {
      return NextResponse.json({ error: "This exam attempt has already been submitted." }, { status: 409 });
    }
    if (outcome.type !== "ready") {
      return NextResponse.json({ error: "This exam could not be started. Please try again." }, { status: 409 });
    }

    return NextResponse.json({
      expiresAt: outcome.attempt.expiresAt.toISOString(),
      durationMins: exam.durationMins,
      remainingSeconds: Math.max(0, Math.ceil((outcome.attempt.expiresAt.getTime() - Date.now()) / 1000)),
    });
  } catch (error) {
    console.error("Exam attempt could not be started:", error);
    return NextResponse.json({ error: "This exam could not be started. Please try again." }, { status: 400 });
  }
}
