import { NextResponse } from "next/server";

import { getMongoUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getMongoUser();
  if (!user) return NextResponse.json({ error: "Sign in to download this paper." }, { status: 401 });
  const { id } = await context.params;
  const paper = await prisma.writtenPaper.findUnique({ where: { id }, select: { published: true, startsAt: true, endsAt: true, fileName: true, mimeType: true, document: true } });
  if (!paper || (!paper.published && user.role !== "admin")) return NextResponse.json({ error: "This question paper is not available." }, { status: 404 });
  if (user.role === "student" && paper.startsAt && new Date() < paper.startsAt) return NextResponse.json({ error: "This question paper is not available before its scheduled start." }, { status: 404 });
  if (user.role === "student" && paper.endsAt && new Date() >= paper.endsAt) return NextResponse.json({ error: "This question paper is no longer available." }, { status: 404 });

  const safeFileName = paper.fileName.replace(/[\r\n"\\]/g, "_");
  const inline = new URL(_request.url).searchParams.get("inline") === "1" && paper.mimeType === "application/pdf";
  return new Response(new Uint8Array(paper.document), {
    headers: {
      "Content-Type": paper.mimeType,
      "Content-Length": String(paper.document.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(paper.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
