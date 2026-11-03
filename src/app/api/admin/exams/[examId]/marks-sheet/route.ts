import { NextResponse } from "next/server";

import { getMongoUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const maxFileSize = 4 * 1024 * 1024;
const allowedTypes: Record<string, string> = {
  pdf: "application/pdf",
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function documentResponse(document: Uint8Array | null, fileName: string | null, mimeType: string | null) {
  if (!document || !fileName || !mimeType) {
    return NextResponse.json({ error: "No marks sheet has been published for this exam." }, { status: 404 });
  }
  const safeFileName = fileName.replace(/[\r\n"\\]/g, "_");
  return new Response(new Uint8Array(document), {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(document.byteLength),
      "Content-Disposition": `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(_request: Request, context: { params: Promise<{ examId: string }> }) {
  const user = await getMongoUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }
  const { examId } = await context.params;
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { marksSheetDocument: true, marksSheetFileName: true, marksSheetMimeType: true },
  });
  if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  return documentResponse(exam.marksSheetDocument, exam.marksSheetFileName, exam.marksSheetMimeType);
}

export async function POST(request: Request, context: { params: Promise<{ examId: string }> }) {
  const user = await getMongoUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }

  const { examId } = await context.params;
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, title: true, published: true },
  });
  if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  if (!exam.published) return NextResponse.json({ error: "Publish the exam before publishing its marks sheet." }, { status: 409 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Upload the marks sheet as a file." }, { status: 400 });
  }
  const file = form.get("marksSheet");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a marks sheet document." }, { status: 400 });
  if (file.size < 1 || file.size > maxFileSize) {
    return NextResponse.json({ error: "The marks sheet must be larger than 0 bytes and no larger than 4 MB." }, { status: 413 });
  }
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const mimeType = allowedTypes[extension];
  if (!mimeType) {
    return NextResponse.json({ error: "Upload the marks sheet as PDF, XLS, XLSX, DOC, DOCX, or CSV." }, { status: 415 });
  }
  const fileName = file.name.replace(/[\r\n]/g, "_").slice(0, 180);
  const document = Buffer.from(await file.arrayBuffer());
  const now = new Date();

  try {
    const [attempts, history] = await Promise.all([
      prisma.examAttempt.findMany({
        where: {
          examId,
          OR: [
            { status: "SUBMITTED" },
            { status: "EXPIRED" },
            { status: "IN_PROGRESS", expiresAt: { lte: now } },
          ],
        },
        select: { userId: true },
      }),
      prisma.quizAttemptHistory.findMany({ where: { examId }, select: { userId: true } }),
    ]);
    const participantIds = [...new Set([...attempts, ...history].map((attempt) => attempt.userId))];

    await prisma.$transaction(async (transaction) => {
      await transaction.exam.update({
        where: { id: examId },
        data: {
          marksSheetFileName: fileName,
          marksSheetMimeType: mimeType,
          marksSheetDocument: document,
          marksSheetPublishedAt: now,
        },
      });
      if (participantIds.length > 0) {
        await transaction.marksSheetNotification.createMany({
          data: participantIds.map((userId) => ({ examId, userId, createdAt: now })),
        });
      }
    });

    return NextResponse.json({ success: true, fileName, notifiedStudents: participantIds.length });
  } catch (error) {
    console.error("Exam marks sheet could not be published:", error);
    return NextResponse.json({ error: "The marks sheet could not be published. Please try again." }, { status: 500 });
  }
}
