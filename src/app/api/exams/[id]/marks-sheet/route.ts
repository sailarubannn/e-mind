import { NextResponse } from "next/server";

import { getMongoUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getMongoUser();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Student access is required." }, { status: 403 });
  }

  const { id: examId } = await context.params;
  const notification = await prisma.marksSheetNotification.findFirst({
    where: { examId, userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { exam: { select: { published: true, marksSheetPublishedAt: true, marksSheetDocument: true, marksSheetFileName: true, marksSheetMimeType: true } } },
  });
  const exam = notification?.exam;
  if (!exam?.published || !exam.marksSheetPublishedAt || !exam.marksSheetDocument || !exam.marksSheetFileName || !exam.marksSheetMimeType) {
    return NextResponse.json({ error: "A marks sheet is not available for your exam." }, { status: 404 });
  }

  const safeFileName = exam.marksSheetFileName.replace(/[\r\n"\\]/g, "_");
  return new Response(new Uint8Array(exam.marksSheetDocument), {
    headers: {
      "Content-Type": exam.marksSheetMimeType,
      "Content-Length": String(exam.marksSheetDocument.byteLength),
      "Content-Disposition": `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(exam.marksSheetFileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
