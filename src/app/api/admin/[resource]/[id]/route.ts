import { NextResponse } from "next/server";

import { getMongoUser } from "@/lib/auth";
import { academicLevel, isValidAcademicAudience } from "@/lib/academic-eligibility";
import { resolveOptionAnswer } from "@/lib/exam-answers";
import { prisma } from "@/lib/prisma";

const resources = new Set(["users", "books", "videos", "exams"]);

async function isAdmin() {
  return (await getMongoUser())?.role === "admin";
}

type ExamQuestionInput = { prompt: string; options: string[]; correctAnswer: string | null; imageUrl: string | null; optionImages: string[] };

function examQuestions(value: unknown): ExamQuestionInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
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

export async function PATCH(request: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const { resource, id } = await context.params;
  if (!resources.has(resource)) return NextResponse.json({ error: "Unknown admin resource." }, { status: 404 });

  try {
    const body = await request.json() as Record<string, unknown>;
    if (resource === "users") {
      const current = await prisma.user.findUnique({ where: { id }, select: { role: true, educationLevel: true, grade: true, stream: true } });
      if (!current) return NextResponse.json({ error: "User not found." }, { status: 404 });
      const data: { fullName?: string; role?: "STUDENT" | "ADMIN" | "TEACHER"; educationLevel?: string | null; grade?: number | null; stream?: string | null; passwordHash?: string } = {};
      if (body.fullName !== undefined) data.fullName = String(body.fullName);
      if (body.role === "STUDENT" || body.role === "ADMIN" || body.role === "TEACHER") data.role = body.role;
      if (body.educationLevel !== undefined) data.educationLevel = body.educationLevel ? String(body.educationLevel) : null;
      if (body.grade !== undefined) data.grade = body.grade === "" || body.grade === null ? null : Number(body.grade);
      if (body.stream !== undefined) data.stream = body.stream ? String(body.stream) : null;
      const role = data.role ?? current.role;
      const educationLevel = data.educationLevel === undefined ? current.educationLevel : data.educationLevel;
      const grade = data.grade === undefined ? current.grade : data.grade;
      const stream = data.stream === undefined ? current.stream : data.stream;
      if (role === "STUDENT" && (body.role !== undefined || body.educationLevel !== undefined || body.grade !== undefined || body.stream !== undefined)) {
        const level = academicLevel(educationLevel);
        if (!level || grade === null || !isValidAcademicAudience(level, grade, stream)) {
          return NextResponse.json({ error: "Choose a valid education level and matching grade; A/L students also need a stream." }, { status: 400 });
        }
      }
      if (body.password) {
        const { hashPassword } = await import("@/lib/auth");
        data.passwordHash = await hashPassword(String(body.password));
      }
      return NextResponse.json({ item: await prisma.user.update({ where: { id }, data, select: { id: true, email: true, fullName: true, role: true, educationLevel: true, grade: true, stream: true } }) });
    }
    if (resource === "books") return NextResponse.json({ item: await prisma.book.update({ where: { id }, data: { ...body, price: body.price === undefined ? undefined : Number(body.price) } }) });
    if (resource === "videos") return NextResponse.json({ item: await prisma.video.update({ where: { id }, data: body }) });

    if (resource === "exams") {
      const current = await prisma.exam.findUnique({ where: { id }, include: { questions: { orderBy: { id: "asc" } }, attempts: { select: { id: true, status: true, expiresAt: true } }, _count: { select: { attempts: true } } } });
      if (!current) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
      const startsAt = body.startsAt === undefined ? current.startsAt : new Date(String(body.startsAt));
      const endsAt = body.endsAt === undefined ? current.endsAt : new Date(String(body.endsAt));
      const durationMins = body.durationMins === undefined ? current.durationMins : Number(body.durationMins);
      if (!String(body.title ?? current.title).trim() || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt || !Number.isInteger(durationMins) || durationMins < 1 || durationMins > 600) {
        return NextResponse.json({ error: "Enter a title, valid exam window, and duration between 1 and 600 minutes." }, { status: 400 });
      }
      const data: Record<string, unknown> = {
        title: String(body.title ?? current.title).trim(),
        description: body.description === undefined ? current.description : body.description ? String(body.description) : null,
        educationLevel: body.educationLevel === "A_LEVEL" || body.educationLevel === "O_LEVEL" || body.educationLevel === "GRADE" ? body.educationLevel : current.educationLevel,
        grade: body.grade === undefined ? current.grade : body.grade ? Number(body.grade) : null,
        stream: body.stream === undefined ? current.stream : body.stream ? String(body.stream) : null,
        durationMins, startsAt, endsAt,
        published: body.published === undefined ? current.published : Boolean(body.published),
      };
      const audienceLevel = data.educationLevel;
      if ((audienceLevel !== "A_LEVEL" && audienceLevel !== "O_LEVEL" && audienceLevel !== "GRADE")
        || !isValidAcademicAudience(audienceLevel, Number(data.grade), typeof data.stream === "string" ? data.stream : null)) {
        return NextResponse.json({ error: "Choose a valid grade for this education level; A/L exams also need a stream." }, { status: 400 });
      }
      if (body.subject !== undefined) {
        const subjectName = String(body.subject).trim();
        if (!subjectName) return NextResponse.json({ error: "Subject is required." }, { status: 400 });
        const subject = await prisma.subject.upsert({ where: { name: subjectName }, update: {}, create: { name: subjectName } });
        data.subject = { connect: { id: subject.id } };
      }
      if (body.questions !== undefined) {
        const questions = examQuestions(body.questions);
        const signature = (question: { prompt: string; options: unknown; correctAnswer: string | null; imageUrl?: string | null; optionImages?: string[]; marks: number }) => {
          const options = Array.isArray(question.options) ? question.options.map(String) : [];
          return JSON.stringify({ prompt: question.prompt.trim(), options, correctAnswer: resolveOptionAnswer(question.correctAnswer, options), imageUrl: question.imageUrl ?? null, optionImages: question.optionImages ?? [], marks: question.marks });
        };
        const sameAsSaved = current.questions.map(signature);
        const savedQuestionsUnchanged = current.questions.every((question, index) => index < questions.length && signature({ ...questions[index], marks: 1 }) === sameAsSaved[index]);
        const changed = !savedQuestionsUnchanged || questions.length !== current.questions.length;
        const isComplete = (question: ExamQuestionInput) => Boolean(
          question.prompt.trim() && question.options.filter((option, index) => Boolean(option) || Boolean(question.optionImages[index])).length >= 2 &&
          !question.options.some((option, index) => !option && !question.optionImages[index] && question.options.slice(index + 1).some((later, laterIndex) => Boolean(later) || Boolean(question.optionImages[index + 1 + laterIndex]))) &&
          resolveOptionAnswer(question.correctAnswer, question.options),
        );

        if (changed && current._count.attempts > 0) {
          if (!savedQuestionsUnchanged || questions.length < current.questions.length) {
            return NextResponse.json({ error: "Questions already used for student marks cannot be edited or removed. Add new questions at the end of the list instead." }, { status: 409 });
          }
          const now = new Date();
          if (current.attempts.some((attempt) => attempt.status === "IN_PROGRESS" && attempt.expiresAt > now)) {
            return NextResponse.json({ error: "Wait until all students currently taking this exam have submitted before adding questions." }, { status: 409 });
          }
          const addedQuestions = questions.slice(current.questions.length);
          if (addedQuestions.some((question) => !isComplete(question))) {
            return NextResponse.json({ error: "Complete each new question with a prompt, two consecutive options, and a valid correct answer." }, { status: 400 });
          }
          const attemptIds = current.attempts.map((attempt) => attempt.id);
          const updated = await prisma.$transaction(async (transaction) => {
            await transaction.examAttempt.updateMany({ where: { examId: id, status: "IN_PROGRESS", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
            if (attemptIds.length) await transaction.result.updateMany({ where: { attemptId: { in: attemptIds }, totalMarks: null }, data: { totalMarks: current.totalMarks } });
            await transaction.question.createMany({ data: addedQuestions.map((question) => ({ examId: id, type: "MCQ", prompt: question.prompt, imageUrl: question.imageUrl, optionImages: question.optionImages, marks: 1, options: question.options, correctAnswer: question.correctAnswer })) });
            return transaction.exam.update({ where: { id }, data: { ...data, totalMarks: current.totalMarks + addedQuestions.length }, include: { subject: true, questions: { orderBy: { id: "asc" } } } });
          });
          return NextResponse.json({ item: updated });
        }

        if (changed) {
          if (questions.length === 0 || questions.some((question) => !isComplete(question))) {
            return NextResponse.json({ error: "Complete each changed question with a prompt, two consecutive options, and a valid correct answer." }, { status: 400 });
          }
          data.totalMarks = questions.length;
          data.questions = { deleteMany: {}, create: questions.map((question) => ({ type: "MCQ", prompt: question.prompt, imageUrl: question.imageUrl, optionImages: question.optionImages, marks: 1, options: question.options, correctAnswer: question.correctAnswer })) };
        }
      }
      return NextResponse.json({ item: await prisma.exam.update({ where: { id }, data, include: { subject: true, questions: true } }) });
    }
    return NextResponse.json({ error: "Unknown resource." }, { status: 404 });
  } catch (error) {
    console.error("Admin content update failed:", error);
    return NextResponse.json({ error: "We could not save those changes. Check the details and try again." }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  const user = await getMongoUser();
  if (!user) return NextResponse.json({ error: "Your session has expired. Sign in with an administrator account to continue." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "The signed-in account does not have administrator permissions. Sign in with an administrator account to delete records." }, { status: 403 });
  const { resource, id } = await context.params;
  if (!resources.has(resource)) return NextResponse.json({ error: "Unknown admin resource." }, { status: 404 });

  try {
    if (resource === "users") {
      await prisma.studentProfile.deleteMany({ where: { userId: id } });
      await prisma.performanceAnalytics.deleteMany({ where: { userId: id } });
      await prisma.learningHistory.deleteMany({ where: { userId: id } });
      await prisma.studentSubject.deleteMany({ where: { studentProfileId: id } });
      await prisma.examAttempt.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } });
    } else if (resource === "books") await prisma.book.delete({ where: { id } });
    else if (resource === "videos") await prisma.video.delete({ where: { id } });
    else {
      await prisma.$transaction(async (transaction) => {
        const attempts = await transaction.examAttempt.findMany({ where: { examId: id }, select: { id: true } });
        const attemptIds = attempts.map((attempt) => attempt.id);
        if (attemptIds.length) {
          await transaction.result.deleteMany({ where: { attemptId: { in: attemptIds } } });
          await transaction.studentAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
          await transaction.examAttempt.deleteMany({ where: { id: { in: attemptIds } } });
        }
        const questions = await transaction.question.findMany({ where: { examId: id }, select: { id: true } });
        const questionIds = questions.map((question) => question.id);
        if (questionIds.length) await transaction.studentAnswer.deleteMany({ where: { questionId: { in: questionIds } } });
        await transaction.question.deleteMany({ where: { examId: id } });
        await transaction.exam.delete({ where: { id } });
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin content deletion failed:", error);
    return NextResponse.json({ error: "We could not delete this item. Please try again." }, { status: 400 });
  }
}
