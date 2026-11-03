import { NextResponse } from "next/server";

import { getMongoUser } from "@/lib/auth";
import { isQuizExam } from "@/lib/is-quiz-exam";
import { isValidAcademicAudience } from "@/lib/academic-eligibility";
import { resolveOptionAnswer } from "@/lib/exam-answers";
import { prisma } from "@/lib/prisma";

function errorResponse(error: unknown) {
  console.error("Admin quiz request failed:", error);
  return NextResponse.json({ error: "We could not complete that request. Check the details and try again." }, { status: 400 });
}

type QuizQuestionInput = {
  prompt: string;
  options: string[];
  correctAnswer: string | null;
  difficulty?: "easy" | "medium" | "hard" | "normal";
  imageUrl?: string | null;
  optionImages?: string[];
};

function quizQuestions(value: unknown): QuizQuestionInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return { prompt: item.trim(), options: [], correctAnswer: null, imageUrl: null, optionImages: [] };
    const question = item as { prompt?: unknown; options?: unknown; correctAnswer?: unknown; difficulty?: unknown; imageUrl?: unknown; optionImages?: unknown };
    const difficultyValue = typeof question.difficulty === "string" ? question.difficulty : "normal";
    return {
      prompt: String(question.prompt ?? "").trim(),
      options: Array.isArray(question.options) ? question.options.map((option) => String(option).trim()) : [],
      correctAnswer: resolveOptionAnswer(question.correctAnswer, Array.isArray(question.options) ? question.options.map((option) => String(option).trim()) : []),
      difficulty: (["easy", "medium", "hard", "normal"].includes(difficultyValue) ? difficultyValue : "normal") as "easy" | "medium" | "hard" | "normal",
      imageUrl: typeof question.imageUrl === "string" && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(question.imageUrl) && question.imageUrl.length <= 7_000_000 ? question.imageUrl : null,
      optionImages: Array.isArray(question.optionImages) ? question.optionImages.slice(0, 5).map((image) => typeof image === "string" && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(image) && image.length <= 7_000_000 ? image : "") : [],
    };
  });
}

async function requireAdmin() {
  const user = await getMongoUser();
  return user?.role === "admin" ? user : null;
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;

    const title = String(body.title ?? "").trim();
    const subjectName = String(body.subject ?? "").trim();
    const educationLevel = body.educationLevel === "A_LEVEL" || body.educationLevel === "O_LEVEL" || body.educationLevel === "GRADE" ? body.educationLevel : null;
    const grade = body.grade ? Number(body.grade) : null;
    const stream = body.stream ? String(body.stream).trim() : null;
    const description = body.description ? String(body.description) : null;
    const durationMins = Number(body.durationMins ?? 30);
    const questions = quizQuestions(body.questions);

    if (!title || !subjectName) {
      return NextResponse.json({ error: "Title and subject are required." }, { status: 400 });
    }
    if (!educationLevel || grade === null || !isValidAcademicAudience(educationLevel, grade, stream)) {
      return NextResponse.json({ error: "Choose a valid grade for this education level; A/L quizzes also need a stream." }, { status: 400 });
    }

    if (questions.length === 0) {
      return NextResponse.json({ error: "Add at least one question before saving." }, { status: 400 });
    }

    const incompleteQuestion = questions.some((question) => {
      const options = question.options.map((option) => option.trim());
      return !question.prompt.trim() || options.filter(Boolean).length < 2 || !question.correctAnswer;
    });

    if (incompleteQuestion) {
      return NextResponse.json({ error: "Complete every question with a prompt, at least two options, and a correct answer." }, { status: 400 });
    }

    const subject = await prisma.subject.upsert({ where: { name: subjectName }, update: {}, create: { name: subjectName } });

    const now = new Date();
    const farFuture = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const quiz = await prisma.exam.create({
      data: {
        title,
        description,
        educationLevel,
        grade,
        stream,
        durationMins,
        totalMarks: questions.length,
        startsAt: now,
        endsAt: farFuture,
        isQuiz: true,
        published: true,
        subjectId: subject.id,
        questions: {
          create: questions.map((question) => ({
            type: "MCQ",
            prompt: question.prompt,
            imageUrl: question.imageUrl,
            optionImages: question.optionImages ?? [],
            marks: 1,
            options: question.options,
            correctAnswer: question.correctAnswer,
          })),
        },
      },
      include: {
        subject: true,
        questions: true,
      },
    });

    return NextResponse.json({ item: quiz, id: quiz.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });

  const publishedExams = await prisma.exam.findMany({
    where: { published: true },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      durationMins: true,
      isQuiz: true,
      subject: { select: { name: true } },
      questions: { select: { id: true } },
      attempts: {
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          status: true,
          startedAt: true,
          submittedAt: true,
          expiresAt: true,
          answerFileName: true,
          user: { select: { id: true, fullName: true, email: true, mobileNumber: true } },
          result: { select: { obtainedMarks: true, totalMarks: true, percentage: true, passed: true } },
        },
      },
    },
  });

  const quizzes = publishedExams.filter(isQuizExam);
  const history = await prisma.quizAttemptHistory.findMany({
    where: { examId: { in: quizzes.map((quiz) => quiz.id) } },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      examId: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      expiresAt: true,
      obtainedMarks: true,
      totalMarks: true,
      percentage: true,
      passed: true,
      answerFileName: true,
      user: { select: { id: true, fullName: true, email: true, mobileNumber: true } },
    },
  });
  const historyByQuiz = new Map<string, typeof history>();
  for (const attempt of history) {
    historyByQuiz.set(attempt.examId, [...(historyByQuiz.get(attempt.examId) ?? []), attempt]);
  }

  const now = Date.now();
  const items = quizzes.map((quiz) => ({
    ...quiz,
    attempts: [
      ...quiz.attempts.map((attempt) => ({
        ...attempt,
        status: attempt.status === "IN_PROGRESS" && attempt.expiresAt.getTime() <= now ? "EXPIRED" : attempt.status,
        result: attempt.result,
        isHistory: false,
      })),
      ...(historyByQuiz.get(quiz.id) ?? []).map((attempt) => ({
        id: `history-${attempt.id}`,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        expiresAt: attempt.expiresAt,
        answerFileName: attempt.answerFileName,
        user: attempt.user,
        result: attempt.obtainedMarks === null || attempt.percentage === null || attempt.passed === null
          ? null
          : {
            obtainedMarks: attempt.obtainedMarks,
            totalMarks: attempt.totalMarks,
            percentage: attempt.percentage,
            passed: attempt.passed,
          },
        isHistory: true,
      })),
    ].sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime()),
  }));

  return NextResponse.json({ items });
}