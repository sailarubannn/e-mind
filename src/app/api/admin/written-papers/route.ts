import { NextResponse } from "next/server";

import { getMongoUser } from "@/lib/auth";
import { isValidAcademicAudience } from "@/lib/academic-eligibility";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const maxFileSize = 10 * 1024 * 1024;
const allowedExtensions = /\.(pdf|docx)$/i;
async function requireAdmin() {
  return (await getMongoUser())?.role === "admin";
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const papers = await prisma.writtenPaper.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, subject: true, educationLevel: true, grade: true, stream: true, fileName: true, durationMins: true, startsAt: true, endsAt: true, published: true, answerSchemeFileName: true, answerSchemePublished: true, createdAt: true },
  });
  const attempts = await prisma.writtenPaperAttempt.findMany({ where: { paperId: { in: papers.map((paper) => paper.id) }, submittedAt: { not: null } }, select: { id: true, paperId: true, userId: true, fileName: true, submittedAt: true }, orderBy: { submittedAt: "desc" } });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(attempts.map((attempt) => attempt.userId))] } }, select: { id: true, fullName: true, email: true, mobileNumber: true } });
  const userById = new Map(users.map((user) => [user.id, user]));
  const submissionsByPaper = new Map<string, typeof attempts>();
  for (const attempt of attempts) submissionsByPaper.set(attempt.paperId, [...(submissionsByPaper.get(attempt.paperId) ?? []), attempt]);
  return NextResponse.json({ items: papers.map((paper) => ({ ...paper, durationMins: paper.durationMins ?? 60, submissions: (submissionsByPaper.get(paper.id) ?? []).map((attempt) => ({ id: attempt.id, fileName: attempt.fileName, submittedAt: attempt.submittedAt, student: userById.get(attempt.userId) })) })) });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Upload the paper as a multipart form." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || !allowedExtensions.test(file.name)) {
    return NextResponse.json({ error: "Choose a PDF or DOCX question paper." }, { status: 415 });
  }
  if (file.size === 0 || file.size > maxFileSize) {
    return NextResponse.json({ error: "The paper must be larger than 0 bytes and smaller than 10 MB." }, { status: 413 });
  }

  const title = String(form.get("title") ?? "").trim();
  const subject = String(form.get("subject") ?? "").trim();
  const levelValue = String(form.get("educationLevel") ?? "GRADE");
  const educationLevel = levelValue === "A_LEVEL" || levelValue === "O_LEVEL" || levelValue === "GRADE" ? levelValue : null;
  const gradeValue = String(form.get("grade") ?? "").trim();
  const streamValue = String(form.get("stream") ?? "").trim();
  const published = form.get("published") === "true";
  const durationMins = Number(form.get("durationMins"));
  const startsAt = new Date(String(form.get("startsAt") ?? ""));
  const endsAt = new Date(String(form.get("endsAt") ?? ""));
  if (!title || !subject || !Number.isInteger(durationMins) || durationMins < 1 || durationMins > 600) {
    return NextResponse.json({ error: "Add a title, subject, and a duration from 1 to 600 minutes." }, { status: 400 });
  }
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: "Choose a valid exam window with an end date and time after the start." }, { status: 400 });
  }
  const grade = gradeValue ? Number(gradeValue) : null;
  if (!educationLevel || grade === null || !isValidAcademicAudience(educationLevel, grade, streamValue)) {
    return NextResponse.json({ error: "Choose a valid grade for this education level; A/L papers also need a stream." }, { status: 400 });
  }

  const paper = await prisma.writtenPaper.create({
    data: {
      title, subject, educationLevel, grade, stream: streamValue || null, durationMins, startsAt, endsAt,
      fileName: file.name, mimeType: file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      document: Buffer.from(await file.arrayBuffer()), published,
    },
    select: { id: true, title: true, subject: true, educationLevel: true, grade: true, stream: true, fileName: true, durationMins: true, startsAt: true, endsAt: true, published: true, createdAt: true },
  });
  return NextResponse.json({ item: paper }, { status: 201 });
}
