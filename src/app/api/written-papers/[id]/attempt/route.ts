import { NextResponse } from "next/server";

import { getMongoUser } from "@/lib/auth";
import { matchesAcademicAudience } from "@/lib/academic-eligibility";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const maxAnswerSize = 15 * 1024 * 1024;
const allowedFile = /\.(pdf|png|jpe?g|webp)$/i;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getMongoUser();
  if (!user || user.role !== "student") return NextResponse.json({ error: "Sign in as a student to take this paper." }, { status: 401 });
  const { id: paperId } = await context.params;
  const paper = await prisma.writtenPaper.findFirst({ where: { id: paperId, published: true }, select: { id: true, durationMins: true, educationLevel: true, grade: true, stream: true } });
  if (!paper) return NextResponse.json({ error: "This question paper is not available." }, { status: 404 });
  if (!matchesAcademicAudience(user, paper)) return NextResponse.json({ error: "This paper is not available for your grade or stream." }, { status: 403 });

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try { form = await request.formData(); } catch { return NextResponse.json({ error: "Choose a scanned answer paper to upload." }, { status: 400 }); }
    const file = form.get("file");
    if (!(file instanceof File) || !allowedFile.test(file.name)) return NextResponse.json({ error: "Upload a PDF or image (PNG, JPG, or WEBP)." }, { status: 415 });
    if (file.size < 1 || file.size > maxAnswerSize) return NextResponse.json({ error: "The answer paper must be smaller than 15 MB." }, { status: 413 });
    const attempt = await prisma.writtenPaperAttempt.findUnique({ where: { paperId_userId: { paperId, userId: user.id } } });
    if (!attempt) return NextResponse.json({ error: "Start the exam before uploading your answer paper." }, { status: 409 });
    if (attempt.submittedAt) return NextResponse.json({ error: "Your answer paper has already been submitted." }, { status: 409 });
    if (Date.now() >= attempt.expiresAt.getTime()) return NextResponse.json({ error: "The exam time has ended. The upload deadline has passed." }, { status: 410 });
    const mimeType = file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : file.type.startsWith("image/") ? file.type : "application/octet-stream";
    await prisma.writtenPaperAttempt.update({
      where: { id: attempt.id },
      data: { submittedAt: new Date(), fileName: file.name, mimeType, document: Buffer.from(await file.arrayBuffer()) },
    });
    return NextResponse.json({ submittedAt: new Date().toISOString(), fileName: file.name });
  }

  const existing = await prisma.writtenPaperAttempt.findUnique({ where: { paperId_userId: { paperId, userId: user.id } } });
  const attempt = existing ?? await prisma.writtenPaperAttempt.create({
    data: { paperId, userId: user.id, expiresAt: new Date(Date.now() + (paper.durationMins ?? 60) * 60_000) },
  }).catch(async (error: unknown) => {
    // A second tab may create the unique student-paper attempt at the same time.
    const raced = await prisma.writtenPaperAttempt.findUnique({ where: { paperId_userId: { paperId, userId: user.id } } });
    if (raced) return raced;
    throw error;
  });
  return NextResponse.json({ expiresAt: attempt.expiresAt.toISOString(), submittedAt: attempt.submittedAt?.toISOString() ?? null, fileName: attempt.fileName, remainingSeconds: Math.max(0, Math.ceil((attempt.expiresAt.getTime() - Date.now()) / 1000)) });
}
