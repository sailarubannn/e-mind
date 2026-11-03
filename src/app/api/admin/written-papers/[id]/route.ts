import { NextResponse } from "next/server";

import { getMongoUser } from "@/lib/auth";
import { isValidAcademicAudience } from "@/lib/academic-eligibility";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if ((await getMongoUser())?.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const { id } = await context.params;
  let body: { published?: unknown; answerSchemePublished?: unknown; educationLevel?: unknown; grade?: unknown; stream?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Submit a valid publication setting." }, { status: 400 });
  }
  if (body.educationLevel !== undefined || body.grade !== undefined || body.stream !== undefined) {
    const level = body.educationLevel;
    const grade = Number(body.grade);
    const stream = typeof body.stream === "string" ? body.stream.trim() : "";
    if ((level !== "A_LEVEL" && level !== "O_LEVEL" && level !== "GRADE") || !isValidAcademicAudience(level, grade, stream)) {
      return NextResponse.json({ error: "Choose a valid grade for this education level; A/L papers also need a stream." }, { status: 400 });
    }
    try {
      const paper = await prisma.writtenPaper.update({
        where: { id },
        data: { educationLevel: level, grade, stream: stream || null },
        select: { id: true, educationLevel: true, grade: true, stream: true },
      });
      return NextResponse.json({ item: paper });
    } catch {
      return NextResponse.json({ error: "The paper could not be found." }, { status: 404 });
    }
  }
  if (typeof body.published !== "boolean" && typeof body.answerSchemePublished !== "boolean") {
    return NextResponse.json({ error: "Choose whether the paper or answer scheme should be published." }, { status: 400 });
  }
  try {
    if (body.answerSchemePublished === true) {
      const answerScheme = await prisma.writtenPaper.findUnique({ where: { id }, select: { answerSchemeFileName: true } });
      if (!answerScheme?.answerSchemeFileName) {
        return NextResponse.json({ error: "Upload an answer scheme before publishing it." }, { status: 409 });
      }
    }
    const paper = await prisma.writtenPaper.update({
      where: { id },
      data: {
        published: typeof body.published === "boolean" ? body.published : undefined,
        answerSchemePublished: typeof body.answerSchemePublished === "boolean" ? body.answerSchemePublished : undefined,
      },
      select: { id: true, published: true, answerSchemePublished: true },
    });
    return NextResponse.json({ item: paper });
  } catch {
    return NextResponse.json({ error: "The paper could not be found." }, { status: 404 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if ((await getMongoUser())?.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const { id } = await context.params;
  try {
    await prisma.writtenPaperAttempt.deleteMany({ where: { paperId: id } });
    await prisma.writtenPaper.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "The paper could not be found." }, { status: 404 });
  }
}
