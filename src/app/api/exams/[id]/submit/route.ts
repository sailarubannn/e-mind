import { NextResponse } from "next/server";

import { getMongoUser } from "@/lib/auth";
import { matchesAcademicAudience } from "@/lib/academic-eligibility";
import { isValidOptionAnswer, resolveOptionAnswer } from "@/lib/exam-answers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type SubmittedAnswer = { questionId?: unknown; answer?: unknown };
const maxAnswerSize = 15 * 1024 * 1024;
const allowedAnswerFile = /\.(pdf|png|jpe?g|webp)$/i;

function answerMimeType(file: File) {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getMongoUser();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Student access is required." }, { status: 403 });
  }

  const { id: examId } = await context.params;
  let submittedAnswers: SubmittedAnswer[];
  let attachment: { fileName: string; mimeType: string; document: Buffer } | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const answersValue = form.get("answers");
      if (typeof answersValue !== "string") {
        return NextResponse.json({ error: "Submit the exam answers as JSON." }, { status: 400 });
      }
      const body = JSON.parse(answersValue) as { answers?: unknown };
      submittedAnswers = Array.isArray(body.answers) ? body.answers as SubmittedAnswer[] : [];
      const file = form.get("answerSheet");
      if (file !== null) {
        if (!(file instanceof File) || !allowedAnswerFile.test(file.name)) {
          return NextResponse.json({ error: "Upload an answer sheet as a PDF or image (PNG, JPG, or WEBP)." }, { status: 415 });
        }
        if (file.size < 1 || file.size > maxAnswerSize) {
          return NextResponse.json({ error: "The answer sheet must be larger than 0 bytes and no larger than 15 MB." }, { status: 413 });
        }
        const mimeType = answerMimeType(file);
        if (!mimeType) return NextResponse.json({ error: "The answer sheet file type is not supported." }, { status: 415 });
        attachment = { fileName: file.name, mimeType, document: Buffer.from(await file.arrayBuffer()) };
      }
    } else {
      const body = await request.json() as { answers?: unknown };
      submittedAnswers = Array.isArray(body.answers) ? body.answers as SubmittedAnswer[] : [];
    }
  } catch {
    return NextResponse.json({ error: "Submit valid exam answers and an optional answer sheet." }, { status: 400 });
  }
  const exam = await prisma.exam.findFirst({
    where: { id: examId, published: true },
    include: { questions: { orderBy: { id: "asc" } } },
  });
  if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  if (!matchesAcademicAudience(user, exam)) return NextResponse.json({ error: "This exam is not available for your grade or stream." }, { status: 403 });

  const totalMarks = exam.questions.reduce((total, question) => total + question.marks, 0);
  const invalidAnswerKey = exam.questions.some((question) => {
    const options = Array.isArray(question.options) ? question.options.map(String) : [];
    return !Number.isFinite(question.marks) || question.marks <= 0 || !isValidOptionAnswer(question.correctAnswer, options);
  });
  if (exam.questions.length === 0 || totalMarks <= 0 || invalidAnswerKey) {
    return NextResponse.json({ error: "This exam has an invalid answer key or marks. Ask an administrator to review it before submitting." }, { status: 409 });
  }

  const answerByQuestion = new Map(submittedAnswers.map((item) => [String(item.questionId ?? ""), item.answer]));
  const now = new Date();
  const existingAttempt = await prisma.examAttempt.findUnique({
    where: { examId_userId: { examId, userId: user.id } },
  });
  if (!existingAttempt) {
    return NextResponse.json({ error: "Start the exam before submitting answers." }, { status: 409 });
  }
  if (existingAttempt.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "This exam attempt is no longer open." }, { status: 409 });
  }
  if (now.getTime() >= existingAttempt.expiresAt.getTime() + 5_000) {
    await prisma.examAttempt.update({ where: { id: existingAttempt.id }, data: { status: "EXPIRED" } });
    return NextResponse.json({ error: "The exam time has expired." }, { status: 410 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const attempt = existingAttempt;

      const gradedAnswers = exam.questions.map((question) => {
        const options = Array.isArray(question.options) ? question.options.map(String) : [];
        const correctAnswer = resolveOptionAnswer(question.correctAnswer, options);
        const submittedAnswer = resolveOptionAnswer(answerByQuestion.get(question.id), options);
        const correct = submittedAnswer !== null && submittedAnswer === correctAnswer;
        return { attemptId: attempt.id, questionId: question.id, answer: submittedAnswer, awardedMarks: correct ? question.marks : 0, evaluationStatus: "REVIEWED" as const };
      });
      const obtainedMarks = gradedAnswers.reduce((total, answer) => total + answer.awardedMarks, 0);
      const percentage = Number(((obtainedMarks / totalMarks) * 100).toFixed(2));

      await transaction.studentAnswer.deleteMany({ where: { attemptId: attempt.id } });
      await transaction.studentAnswer.createMany({ data: gradedAnswers });
      await transaction.examAttempt.update({
        where: { id: attempt.id },
        data: {
          status: now > attempt.expiresAt ? "EXPIRED" : "SUBMITTED",
          submittedAt: now,
          answerFileName: attachment?.fileName ?? null,
          answerMimeType: attachment?.mimeType ?? null,
          answerDocument: attachment?.document ?? null,
        },
      });
      await transaction.result.deleteMany({ where: { attemptId: attempt.id } });
      return transaction.result.create({ data: { attemptId: attempt.id, obtainedMarks, totalMarks, percentage, passed: percentage >= 50 } });
    });

    if (!result) return NextResponse.json({ error: "The exam result could not be created." }, { status: 500 });
    const review = exam.questions.map((question) => {
      const options = Array.isArray(question.options) ? question.options.map(String) : [];
      const correctAnswer = resolveOptionAnswer(question.correctAnswer, options)!;
      const selectedAnswer = resolveOptionAnswer(answerByQuestion.get(question.id), options);
      return {
        questionId: question.id,
        prompt: question.prompt,
        imageUrl: question.imageUrl,
        optionImages: question.optionImages,
        options,
        selectedAnswer,
        correctAnswer,
        isCorrect: selectedAnswer === correctAnswer,
      };
    });

    return NextResponse.json({ obtainedMarks: result.obtainedMarks, totalMarks, percentage: result.percentage, passed: result.passed, review });
  } catch (error) {
    console.error("Exam submission failed:", error);
    return NextResponse.json({ error: "Your answers could not be submitted. Please try again." }, { status: 400 });
  }
}
