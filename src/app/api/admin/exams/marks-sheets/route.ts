import { NextResponse } from "next/server";

import { getMongoUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const user = await getMongoUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }

  const exams = await prisma.exam.findMany({
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      title: true,
      published: true,
      startsAt: true,
      marksSheetFileName: true,
      marksSheetPublishedAt: true,
      attempts: { select: { userId: true, status: true, expiresAt: true } },
      quizAttemptHistory: { select: { userId: true } },
    },
  });
  const now = new Date();
  const items = exams.map((exam) => {
    const participants = new Set([
      ...exam.attempts
        .filter((attempt) => attempt.status !== "IN_PROGRESS" || attempt.expiresAt <= now)
        .map((attempt) => attempt.userId),
      ...exam.quizAttemptHistory.map((attempt) => attempt.userId),
    ]);
    return {
      id: exam.id,
      title: exam.title,
      published: exam.published,
      startsAt: exam.startsAt,
      marksSheetFileName: exam.marksSheetFileName,
      marksSheetPublishedAt: exam.marksSheetPublishedAt,
      participantCount: participants.size,
    };
  });
  return NextResponse.json({ items });
}
