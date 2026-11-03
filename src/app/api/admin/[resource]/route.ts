import { NextResponse } from "next/server";

import { getMongoUser } from "@/lib/auth";
import { academicLevel, isValidAcademicAudience } from "@/lib/academic-eligibility";
import { resolveOptionAnswer } from "@/lib/exam-answers";
import { prisma } from "@/lib/prisma";

type Resource = "users" | "books" | "videos" | "exams";

function resourceName(value: string): Resource | null {
  return ["users", "books", "videos", "exams"].includes(value) ? value as Resource : null;
}

async function requireAdmin() {
  const user = await getMongoUser();
  return user?.role === "admin" ? user : null;
}

function errorResponse(error: unknown) {
  console.error("Admin content request failed:", error);
  return NextResponse.json({ error: "We could not complete that request. Check the details and try again." }, { status: 400 });
}

type ExamQuestionInput = {
  prompt: string;
  options: string[];
  correctAnswer: string | null;
  imageUrl?: string | null;
  optionImages: string[];
};

function examQuestions(value: unknown): ExamQuestionInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return { prompt: item.trim(), options: [], correctAnswer: null, imageUrl: null, optionImages: [] };
    const question = item as { prompt?: unknown; options?: unknown; correctAnswer?: unknown; imageUrl?: unknown; optionImages?: unknown };
    return {
      prompt: String(question.prompt ?? "").trim(),
      options: Array.isArray(question.options) ? question.options.map((option) => String(option).trim()) : [],
      correctAnswer: resolveOptionAnswer(question.correctAnswer, Array.isArray(question.options) ? question.options.map((option) => String(option).trim()) : []),
      imageUrl: typeof question.imageUrl === "string" && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(question.imageUrl) && question.imageUrl.length <= 7_000_000 ? question.imageUrl : null,
      optionImages: Array.isArray(question.optionImages) ? question.optionImages.slice(0, 5).map((image) => typeof image === "string" && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(image) && image.length <= 7_000_000 ? image : "") : [],
    };
  });
}

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const resource = resourceName((await context.params).resource);
  if (!resource) return NextResponse.json({ error: "Unknown admin resource." }, { status: 404 });

  if (resource === "users") return NextResponse.json({ items: await prisma.user.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, email: true, fullName: true, mobileNumber: true, role: true, educationLevel: true, grade: true, stream: true, createdAt: true } }) });
  if (resource === "books") return NextResponse.json({ items: await prisma.book.findMany({ orderBy: { createdAt: "desc" } }) });
  if (resource === "videos") return NextResponse.json({ items: await prisma.video.findMany({ orderBy: { createdAt: "desc" } }) });
  const exams = await prisma.exam.findMany({
    orderBy: { startsAt: "desc" },
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
      questions: { orderBy: { id: "asc" } },
      attempts: {
        orderBy: { startedAt: "desc" },
        select: {
          id: true, status: true, startedAt: true, submittedAt: true, expiresAt: true, answerFileName: true,
          user: { select: { id: true, fullName: true, email: true, mobileNumber: true } },
          result: { select: { obtainedMarks: true, totalMarks: true, percentage: true, passed: true } },
        },
      },
    },
  });
  const now = Date.now();
  const items = exams.map((exam) => {
    return {
      ...exam,
      attempts: exam.attempts.map((attempt) => ({
        ...attempt,
        status: attempt.status === "IN_PROGRESS" && attempt.expiresAt.getTime() <= now ? "EXPIRED" : attempt.status,
      })),
    };
  });
  return NextResponse.json({ items });
}

export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const resource = resourceName((await context.params).resource);
  if (!resource) return NextResponse.json({ error: "Unknown admin resource." }, { status: 404 });

  try {
    const body = await request.json() as Record<string, unknown>;
    if (resource === "users") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!email || !body.password) return NextResponse.json({ error: "Email and password are required for new users." }, { status: 400 });
      const role = body.role === "ADMIN" || body.role === "TEACHER" ? body.role : "STUDENT";
      const educationLevel = body.educationLevel ? String(body.educationLevel) : null;
      const grade = body.grade === undefined || body.grade === "" ? null : Number(body.grade);
      const stream = body.stream ? String(body.stream).trim() : null;
      const level = academicLevel(educationLevel);
      if (role === "STUDENT" && (!level || grade === null || !isValidAcademicAudience(level, grade, stream))) {
        return NextResponse.json({ error: "Choose a valid education level and matching grade; A/L students also need a stream." }, { status: 400 });
      }
      const { hashPassword } = await import("@/lib/auth");
      const user = await prisma.user.create({ data: { email, passwordHash: await hashPassword(String(body.password)), fullName: String(body.fullName ?? "Student"), role, educationLevel, grade: role === "STUDENT" ? grade : null, stream: role === "STUDENT" ? stream : null, subjects: Array.isArray(body.subjects) ? body.subjects : [] } });
      return NextResponse.json({ item: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } }, { status: 201 });
    }
    if (resource === "books") return NextResponse.json({ item: await prisma.book.create({ data: { title: String(body.title), author: String(body.author), subject: String(body.subject), level: String(body.level), price: Number(body.price), imageUrl: body.imageUrl ? String(body.imageUrl) : null, coverColor: String(body.coverColor ?? "mint"), description: body.description ? String(body.description) : null, published: Boolean(body.published) } }) }, { status: 201 });
    if (resource === "videos") return NextResponse.json({ item: await prisma.video.create({ data: { title: String(body.title), subject: String(body.subject), level: String(body.level), duration: String(body.duration), videoUrl: String(body.videoUrl), thumbnail: body.thumbnail ? String(body.thumbnail) : null, description: body.description ? String(body.description) : null, published: Boolean(body.published) } }) }, { status: 201 });

    const subjectName = String(body.subject ?? "").trim();
    const startsAt = new Date(String(body.startsAt));
    const endsAt = new Date(String(body.endsAt));
    const durationMins = Number(body.durationMins);
    const level = body.educationLevel === "A_LEVEL" || body.educationLevel === "O_LEVEL" || body.educationLevel === "GRADE" ? body.educationLevel : null;
    const grade = Number(body.grade);
    const stream = body.stream ? String(body.stream).trim() : null;
    if (!level || !isValidAcademicAudience(level, grade, stream)) {
      return NextResponse.json({ error: "Choose a valid grade for this education level; A/L exams also need a stream." }, { status: 400 });
    }
    if (!subjectName || !String(body.title ?? "").trim() || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt || !Number.isInteger(durationMins) || durationMins < 1 || durationMins > 600) {
      return NextResponse.json({ error: "Enter a title, subject, valid exam window, and duration between 1 and 600 minutes." }, { status: 400 });
    }
    const subject = await prisma.subject.upsert({ where: { name: subjectName }, update: {}, create: { name: subjectName } });
    const questions = examQuestions(body.questions);
    if (questions.length === 0 || questions.some((question) => !question.prompt || question.options.filter((option, index) => Boolean(option) || Boolean(question.optionImages[index])).length < 2 || !question.correctAnswer)) {
      return NextResponse.json({ error: "Every exam question must have a prompt, at least two options, and a correct answer that matches one of those options." }, { status: 400 });
    }
    const exam = await prisma.exam.create({ data: { title: String(body.title).trim(), description: body.description ? String(body.description) : null, educationLevel: level, grade, stream, durationMins, totalMarks: questions.length, startsAt, endsAt, published: Boolean(body.published), subjectId: subject.id, questions: { create: questions.map((question) => ({ type: "MCQ", prompt: question.prompt, imageUrl: question.imageUrl, optionImages: question.optionImages, marks: 1, options: question.options, correctAnswer: question.correctAnswer })) } }, include: { subject: true, questions: true } });
    return NextResponse.json({ item: exam }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
