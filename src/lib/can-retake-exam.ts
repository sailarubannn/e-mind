import { isQuizExam } from "@/lib/is-quiz-exam";

type RetakeableExam = {
  isQuiz: boolean;
  startsAt: Date;
  endsAt: Date;
  questions: { type: string }[];
};

export function canRetakeExam(exam: RetakeableExam) {
  return isQuizExam(exam) || (exam.questions.length > 0 && exam.questions.every((question) => question.type === "MCQ"));
}
