import { NextResponse } from "next/server";

import { isQuizExam } from "@/lib/is-quiz-exam";
import { getMongoUser } from "@/lib/auth";
import { matchesAcademicAudience } from "@/lib/academic-eligibility";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const user = await getMongoUser();
  const [books, videos, exams, writtenPapers] = await Promise.all([
    prisma.book.findMany({ where: { published: true }, orderBy: { createdAt: "desc" } }),
    prisma.video.findMany({ where: { published: true }, orderBy: { createdAt: "desc" } }),
    prisma.exam.findMany({ where: { published: true }, orderBy: { startsAt: "asc" }, include: { subject: true, questions: { orderBy: { id: "asc" }, select: { id: true, prompt: true, imageUrl: true, optionImages: true, options: true, marks: true, type: true } } } }),
    prisma.writtenPaper.findMany({ where: { published: true }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, subject: true, educationLevel: true, grade: true, stream: true, fileName: true, durationMins: true, answerSchemePublished: true, createdAt: true } }),
  ]);

  return NextResponse.json({
    books,
    videos,
    exams: exams.filter((exam) => user?.role !== "student" || matchesAcademicAudience(user, exam)).map((exam) => ({ ...exam, isQuiz: isQuizExam(exam) })),
    writtenPapers: writtenPapers.filter((paper) => user?.role !== "student" || matchesAcademicAudience(user, paper)).map((paper) => ({ ...paper, durationMins: paper.durationMins ?? 60 })),
  });
}
