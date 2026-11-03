import { NextResponse } from "next/server";

import { isQuizExam } from "@/lib/is-quiz-exam";
import { canRetakeExam } from "@/lib/can-retake-exam";
import { getMongoUser } from "@/lib/auth";
import { matchesAcademicAudience } from "@/lib/academic-eligibility";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const user = await getMongoUser();
  const [books, videos, exams, writtenPapers] = await Promise.all([
    prisma.book.findMany({ where: { published: true }, orderBy: { createdAt: "desc" } }),
    prisma.video.findMany({ where: { published: true }, orderBy: { createdAt: "desc" } }),
    prisma.exam.findMany({
      where: { published: true },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        educationLevel: true,
        grade: true,
        stream: true,
        durationMins: true,
        totalMarks: true,
        startsAt: true,
        endsAt: true,
        isQuiz: true,
        published: true,
        subjectId: true,
        marksSheetFileName: true,
        marksSheetMimeType: true,
        marksSheetPublishedAt: true,
        subject: true,
        questions: {
          orderBy: { id: "asc" },
          select: { id: true, prompt: true, imageUrl: true, optionImages: true, options: true, marks: true, type: true },
        },
      },
    }),
    prisma.writtenPaper.findMany({ where: { published: true }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, subject: true, educationLevel: true, grade: true, stream: true, fileName: true, durationMins: true, answerSchemePublished: true, createdAt: true } }),
  ]);
  const studentAttempts = user?.role === "student"
    ? await prisma.examAttempt.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: "desc" },
      select: { examId: true, status: true, expiresAt: true },
    })
    : [];
  const attemptsByExam = new Map<string, (typeof studentAttempts)[number]>();
  for (const attempt of studentAttempts) {
    if (!attemptsByExam.has(attempt.examId)) attemptsByExam.set(attempt.examId, attempt);
  }
  const now = Date.now();

  return NextResponse.json({
    books,
    videos,
    exams: exams.filter((exam) => user?.role !== "student" || matchesAcademicAudience(user, exam)).map((exam) => {
      const attempt = attemptsByExam.get(exam.id);
      return {
        ...exam,
        isQuiz: isQuizExam(exam),
        canRetake: canRetakeExam(exam),
        studentAttemptStatus: attempt?.status === "IN_PROGRESS" && attempt.expiresAt.getTime() <= now ? "EXPIRED" : attempt?.status ?? null,
      };
    }),
    writtenPapers: writtenPapers.filter((paper) => user?.role !== "student" || matchesAcademicAudience(user, paper)).map((paper) => ({ ...paper, durationMins: paper.durationMins ?? 60 })),
  });
}
