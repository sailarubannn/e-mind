import { useEffect, useRef, useState, type FormEvent } from "react";
import { parsePastedExamQuestions, type ParsedExamQuestion } from "@/lib/exam-question-text";
import { gradeRange, type AcademicLevel } from "@/lib/academic-eligibility";

type DifficultyMode = "easy" | "medium" | "hard" | "normal";

interface QuizQuestion extends ParsedExamQuestion {
  difficulty?: DifficultyMode;
}

interface QuizFormData {
  title: string;
  subject: string;
  educationLevel: AcademicLevel;
  grade: string;
  stream: string;
  description: string;
  difficultyDistribution: Record<DifficultyMode, number>;
}

type QuizAttempt = {
  id: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
  startedAt: string;
  submittedAt: string | null;
  expiresAt: string;
  answerFileName: string | null;
  user: { id: string; fullName: string; email: string; mobileNumber: string | null };
  result: { obtainedMarks: number; totalMarks: number | null; percentage: number; passed: boolean } | null;
  isHistory: boolean;
};

type PublishedQuiz = {
  id: string;
  title: string;
  subject: { name: string };
  startsAt: string;
  endsAt: string;
  durationMins: number;
  questions: { id: string }[];
  attempts: QuizAttempt[];
};

const difficultyModes: { value: DifficultyMode; label: string; color: string; description: string }[] = [
  { value: "easy", label: "Easy", color: "#22c55e", description: "Basic recall and understanding questions" },
  { value: "medium", label: "Medium", color: "#f59e0b", description: "Application and analysis questions" },
  { value: "hard", label: "Hard", color: "#ef4444", description: "Complex problem-solving and synthesis" },
  { value: "normal", label: "Normal (Mixed)", color: "#3b82f6", description: "Balanced mix of all difficulty levels" },
];

const educationLevels = [
  { value: "GRADE", label: "Grade 6–11" },
  { value: "O_LEVEL", label: "GCE Ordinary Level (O/L)" },
  { value: "A_LEVEL", label: "GCE Advanced Level (A/L)" },
];

const streams = ["Biological Science", "Physical Science", "Commerce", "Technology", "Arts", "General"];

export default function QuizExamManager() {
  const [activeQuizTab, setActiveQuizTab] = useState<"list" | "create" | "edit">("list");
  const [quizForm, setQuizForm] = useState<QuizFormData>({
    title: "",
    subject: "",
    educationLevel: "A_LEVEL",
    grade: "",
    stream: "",
    description: "",
    difficultyDistribution: { easy: 0, medium: 0, hard: 0, normal: 0 },
  });
  const [quizQuestions, setQuizQuestions] = useState<Record<DifficultyMode, QuizQuestion[]>>({
    easy: [],
    medium: [],
    hard: [],
    normal: [],
  });
  const [activeDifficulty, setActiveDifficulty] = useState<DifficultyMode>("easy");
  const [quizFile, setQuizFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [extractingQuestions, setExtractingQuestions] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [pasteMessage, setPasteMessage] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [publishedQuizzes, setPublishedQuizzes] = useState<PublishedQuiz[]>([]);
  const [viewingAttempts, setViewingAttempts] = useState<string | null>(null);
  const pasteBoxRef = useRef<HTMLDivElement>(null);

  const totalQuestions = Object.values(quizQuestions).flat().length;

  async function loadQuizzes() {
    try {
      const response = await fetch("/api/admin/quizzes");
      const result = await response.json() as { items?: PublishedQuiz[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not load quizzes.");
      setPublishedQuizzes(result.items ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load quizzes.");
    }
  }

  useEffect(() => {
    if (activeQuizTab === "list") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadQuizzes();
    }
  }, [activeQuizTab]);

  function openCreate() {
    setActiveQuizTab("create");
    setQuizForm({
      title: "",
      subject: "",
      educationLevel: "A_LEVEL",
      grade: "",
      stream: "",
      description: "",
      difficultyDistribution: { easy: 0, medium: 0, hard: 0, normal: 0 },
    });
    setQuizQuestions({ easy: [], medium: [], hard: [], normal: [] });
    setActiveDifficulty("easy");
    setQuizFile(null);
    setPastedText("");
    setPasteMessage("");
    setPasteError("");
    if (pasteBoxRef.current) pasteBoxRef.current.textContent = "";
    setStatus("");
    setError("");
  }

  async function submitQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    if (!quizForm.title || !quizForm.subject) {
      setError("Title and subject are required.");
      setLoading(false);
      return;
    }

    const allQuestions = Object.entries(quizQuestions).flatMap(([difficulty, questions]) =>
      questions.map((q) => ({ ...q, difficulty: difficulty as DifficultyMode }))
    );

    if (allQuestions.length === 0) {
      setError("Add at least one question before saving.");
      setLoading(false);
      return;
    }

    const incompleteQuestion = allQuestions.some((question) => {
      const options = question.options.map((option) => option.trim());
      return !question.prompt.trim() || options.filter(Boolean).length < 2 || !question.correctAnswer;
    });

    if (incompleteQuestion) {
      setError("Complete every question with a prompt, at least two options, and a correct answer.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...quizForm,
          questions: allQuestions,
          totalQuestions: allQuestions.length,
        }),
      });

      const result = await response.json() as { error?: string; id?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not create quiz.");

      setStatus("Quiz created successfully!");
      setActiveQuizTab("list");
      setQuizForm({
        title: "",
        subject: "",
        educationLevel: "A_LEVEL",
        grade: "",
        stream: "",
        description: "",
        difficultyDistribution: { easy: 0, medium: 0, hard: 0, normal: 0 },
      });
      setQuizQuestions({ easy: [], medium: [], hard: [], normal: [] });
      setQuizFile(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save quiz.");
    } finally {
      setLoading(false);
    }
  }

  async function extractQuizQuestions() {
    if (!quizFile) {
      setError("Choose a PDF or DOCX file first.");
      return;
    }
    setExtractingQuestions(true);
    setError("");
    setStatus("Scanning for questions...");

    const formData = new FormData();
    formData.append("file", quizFile);
    try {
      const response = await fetch("/api/admin/exams/upload", { method: "POST", body: formData });
      const result = await response.json() as { questions?: ParsedExamQuestion[]; error?: string; fileName?: string; pagesScanned?: number | null; imagesScanned?: number | null };
      if (!response.ok || !result.questions) throw new Error(result.error ?? "The file could not be read.");

      const scanSummary = result.pagesScanned ? `All ${result.pagesScanned} pages scanned. ` : result.imagesScanned ? `${result.imagesScanned} images scanned. ` : "";
      const questions = result.questions.map((q) => ({ ...q, difficulty: activeDifficulty }));
      setQuizQuestions((current) => ({ ...current, [activeDifficulty]: [...current[activeDifficulty], ...questions] }));
      setQuizForm((current) => ({ ...current, difficultyDistribution: { ...current.difficultyDistribution, [activeDifficulty]: current.difficultyDistribution[activeDifficulty] + questions.length } }));
      setStatus(`${scanSummary}${questions.length} questions extracted from ${result.fileName}. Assigned to ${activeDifficulty} mode.`);
    } catch (extractError) {
      setStatus("");
      setError(extractError instanceof Error ? extractError.message : "The upload failed.");
    } finally {
      setExtractingQuestions(false);
    }
  }

  async function processPastedQuestions() {
    if (!pastedText.trim()) {
      setPasteError("Paste some questions first.");
      return;
    }

    const parsed = parsePastedExamQuestions(pastedText);
    if (parsed.length === 0) {
      setPasteError("No numbered questions found. Use format: 1. Question text\nA) Option 1\nB) Option 2\nAnswer: A");
      return;
    }

    const questions = parsed.map((q) => ({ ...q, difficulty: activeDifficulty }));
    setQuizQuestions((current) => ({ ...current, [activeDifficulty]: [...current[activeDifficulty], ...questions] }));
    setQuizForm((current) => ({ ...current, difficultyDistribution: { ...current.difficultyDistribution, [activeDifficulty]: current.difficultyDistribution[activeDifficulty] + questions.length } }));
    setPastedText("");
    if (pasteBoxRef.current) pasteBoxRef.current.textContent = "";
    setPasteMessage(`Added ${questions.length} questions to ${activeDifficulty} mode.`);
    setPasteError("");
  }

  function addManualQuestion() {
    setQuizQuestions((current) => ({
      ...current,
      [activeDifficulty]: [...current[activeDifficulty], { prompt: "", options: ["", "", "", ""], correctAnswer: null, difficulty: activeDifficulty }],
    }));
    setStatus(`Added blank question to ${activeDifficulty} mode.`);
  }

  function updateQuestion(difficulty: DifficultyMode, index: number, update: Partial<QuizQuestion>) {
    setQuizQuestions((current) => ({
      ...current,
      [difficulty]: current[difficulty].map((q, i) => i === index ? { ...q, ...update } : q),
    }));
  }

  function removeQuestion(difficulty: DifficultyMode, index: number) {
    setQuizQuestions((current) => ({
      ...current,
      [difficulty]: current[difficulty].filter((_, i) => i !== index),
    }));
    setQuizForm((current) => ({
      ...current,
      difficultyDistribution: { ...current.difficultyDistribution, [difficulty]: current.difficultyDistribution[difficulty] - 1 },
    }));
  }

  const questionsForMode = quizQuestions[activeDifficulty];

  const selectedGradeRange = gradeRange(quizForm.educationLevel);
  return (
    <section className="admin-page-content">
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">QUIZ EXAM MANAGER</p>
          <h2>Quiz Exam Manager</h2>
          <p>Create quick quiz exams with difficulty-based question pools. No scheduling required — students can attempt anytime.</p>
        </div>
        <span className={activeQuizTab === "list" ? "publish-status live" : "publish-status"}>Quiz Manager</span>
      </div>

      {activeQuizTab === "list" && (
        <>
          <div className="admin-actions">
            <button className="primary-button" onClick={openCreate}>+ Create Quiz</button>
          </div>
          {status && <p className="admin-upload-status" role="status">{status}</p>}
          {error && <p className="admin-upload-error" role="alert">{error}</p>}
          {publishedQuizzes.length === 0
            ? <p className="admin-empty">No quiz exams have been published yet.</p>
            : <div className="admin-record-list">{publishedQuizzes.map((quiz) => (
              <div key={quiz.id}>
                <article className="admin-record">
                  <div>
                    <strong>{quiz.title}</strong>
                    <small>{quiz.subject.name} · {quiz.questions.length} questions · {quiz.durationMins} minutes · {quiz.attempts.length} student attempts</small>
                  </div>
                  <div className="admin-record-actions">
                    <button type="button" onClick={() => setViewingAttempts(viewingAttempts === quiz.id ? null : quiz.id)}>
                      {viewingAttempts === quiz.id ? "Hide students" : "View students & marks"}
                    </button>
                  </div>
                </article>
                {viewingAttempts === quiz.id && <div className="admin-results">
                  <div className="admin-results-summary">
                    <strong>{quiz.attempts.length} attempt{quiz.attempts.length === 1 ? "" : "s"} recorded</strong>
                    <span>{quiz.attempts.filter((attempt) => attempt.result).length} submitted · {quiz.attempts.filter((attempt) => attempt.status === "IN_PROGRESS").length} in progress</span>
                  </div>
                  {quiz.attempts.length === 0
                    ? <p className="admin-empty">No students have started this quiz.</p>
                    : <div className="admin-results-table-wrap"><table className="admin-results-table">
                      <thead><tr><th>Student</th><th>Email</th><th>Mobile</th><th>Status</th><th>Started</th><th>Submitted</th><th>Answer sheet</th><th>Marks</th><th>Score</th></tr></thead>
                      <tbody>{quiz.attempts.map((attempt) => {
                        const inProgress = attempt.status === "IN_PROGRESS";
                        const result = attempt.result;
                        return <tr key={attempt.id}>
                          <td>{attempt.user.fullName}</td>
                          <td>{attempt.user.email}</td>
                          <td>{attempt.user.mobileNumber || "Not provided"}</td>
                          <td>{result ? result.passed ? "Passed" : "Submitted" : inProgress ? "In progress" : "Expired"}</td>
                          <td>{new Date(attempt.startedAt).toLocaleString()}</td>
                          <td>{attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : "—"}</td>
                          <td>{attempt.answerFileName ? <a href={`/api/admin/exams/${quiz.id}/attempts/${attempt.id}/answer-sheet`}>Download {attempt.answerFileName}</a> : "—"}</td>
                          <td>{result ? `${result.obtainedMarks} / ${result.totalMarks ?? quiz.questions.length}` : "Pending"}</td>
                          <td>{result ? `${result.percentage.toFixed(1)}%` : "—"}</td>
                        </tr>;
                      })}</tbody>
                    </table></div>}
                </div>}
              </div>
            ))}</div>}
        </>
      )}

      {activeQuizTab !== "list" && (
        <form className="admin-editor admin-crud-form" onSubmit={submitQuiz}>
          <div className="admin-editor-fields">
            <label>
              Quiz Title
              <input required value={quizForm.title} onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })} placeholder="e.g. Physics Chapter 1 Quick Quiz" />
            </label>
            <label>
              Subject
              <input required value={quizForm.subject} onChange={(e) => setQuizForm({ ...quizForm, subject: e.target.value })} placeholder="e.g. Physics" />
            </label>
            <label>
              Education Level
              <select required value={quizForm.educationLevel} onChange={(e) => setQuizForm({ ...quizForm, educationLevel: e.target.value as AcademicLevel, grade: "", stream: "" })}>
                {educationLevels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </label>
            <label>
              Grade
              <select required value={quizForm.grade} onChange={(e) => setQuizForm({ ...quizForm, grade: e.target.value })}>
                <option value="">Select Grade</option>
                {Array.from({ length: selectedGradeRange.max - selectedGradeRange.min + 1 }, (_, index) => selectedGradeRange.min + index).map((grade) => <option key={grade} value={String(grade)}>Grade {grade}</option>)}
              </select>
            </label>
            <label>
              Stream {quizForm.educationLevel === "A_LEVEL" ? "(required)" : "(optional)"}
              <select required={quizForm.educationLevel === "A_LEVEL"} value={quizForm.stream} onChange={(e) => setQuizForm({ ...quizForm, stream: e.target.value })}>
                <option value="">Select Stream</option>
                {streams.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              Description
              <textarea rows={3} value={quizForm.description} onChange={(e) => setQuizForm({ ...quizForm, description: e.target.value })} placeholder="Brief description of this quiz..." />
            </label>
          </div>

          {error && <p className="admin-upload-error">{error}</p>}
          {status && <p className="admin-upload-status">{status}</p>}

          <div className="admin-editor-fields" style={{ marginTop: 24 }}>
            <label style={{ gridColumn: "1 / -1" }}>
              <p className="eyebrow" style={{ marginBottom: 12 }}>DIFFICULTY MODES</p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                {difficultyModes.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    className={activeDifficulty === mode.value ? "difficulty-tab active" : "difficulty-tab"}
                    onClick={() => setActiveDifficulty(mode.value)}
                    style={{ background: activeDifficulty === mode.value ? mode.color : "#fff", color: activeDifficulty === mode.value ? "#fff" : mode.color, borderColor: mode.color }}
                  >
                    {mode.label}
                    <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.8 }}>{quizQuestions[mode.value].length} questions</span>
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>
                {difficultyModes.find((m) => m.value === activeDifficulty)?.description}
              </p>
            </label>
          </div>

          <div className="admin-editor-fields" style={{ marginTop: 24 }}>
            <label style={{ gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <p className="eyebrow" style={{ margin: 0 }}>QUESTIONS ({questionsForMode.length})</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="secondary-button" onClick={addManualQuestion}>+ Add Question</button>
                  <button type="button" className="secondary-button" onClick={extractQuizQuestions} disabled={extractingQuestions || !quizFile}>
                    {extractingQuestions ? "Extracting..." : "Extract from File"}
                  </button>
                </div>
              </div>

              <label style={{ gridColumn: "1 / -1" }}>
                Quiz Paper File
                <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setQuizFile(e.target.files?.[0] ?? null)} />
                <small>Upload a PDF or DOCX to extract questions. They will be added to the <strong>{activeDifficulty}</strong> difficulty pool.</small>
              </label>

              <label className="bulk-question-paste" style={{ gridColumn: "1 / -1" }}>
                Paste Questions
                <div ref={pasteBoxRef} className="bulk-question-rich-editor" contentEditable suppressContentEditableWarning role="textbox" aria-label="Paste questions" aria-multiline="true" data-placeholder="Paste questions here. Format: 1. Question\nA) Option A\nB) Option B\nAnswer: A" onInput={(event) => setPastedText(event.currentTarget.innerText)} />
                <small>Paste questions in format: 1. Question text\nA- Statement one\nB- Statement two\n1) A only\n2) B only\nAnswer: 2. Statement labels such as A-, B-, C- stay in the question; numbered or lettered answer choices are identified separately.</small>
                <button type="button" className="secondary-button" onClick={processPastedQuestions} disabled={!pastedText.trim()}>Add Pasted Questions</button>
                {pasteError && <p className="admin-upload-error" style={{ marginTop: 8 }}>{pasteError}</p>}
                {pasteMessage && <p className="admin-upload-status" style={{ marginTop: 8 }}>{pasteMessage}</p>}
              </label>
            </label>
          </div>

          {questionsForMode.length > 0 && (
            <div className="question-preview" style={{ marginTop: 24 }}>
              <div><strong>{questionsForMode.length} questions in {activeDifficulty} mode</strong></div>
              <ol style={{ paddingLeft: 24 }}>
                {questionsForMode.map((question, index) => (
                  <li key={`q-${activeDifficulty}-${index}`} style={{ marginBottom: 16, padding: 12, border: "1px solid var(--line)", borderRadius: 8, background: "#fbfdfc" }}>
                    <label style={{ display: "grid", gap: 8 }}>
                      Question {index + 1}
                      <textarea rows={2} value={question.prompt} onChange={(e) => updateQuestion(activeDifficulty, index, { prompt: e.target.value })} placeholder="Question text" />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <div className="admin-question-options">
                        {question.options.map((option, optIndex) => {
                          const key = String.fromCharCode(65 + optIndex);
                          return (
                            <div key={key} className="admin-option-editor" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <label style={{ width: 24, fontWeight: 700 }}>{key}</label>
                              <input value={option} onChange={(e) => updateQuestion(activeDifficulty, index, { options: question.options.map((o, i) => i === optIndex ? e.target.value : o) })} placeholder={`Option ${key}`} />
                              <input type="radio" name={`correct-${activeDifficulty}-${index}`} checked={question.correctAnswer === key} onChange={() => updateQuestion(activeDifficulty, index, { correctAnswer: key })} />
                            </div>
                          );
                        })}
                      </div>
                    </label>
                    <button type="button" className="danger-button" onClick={() => removeQuestion(activeDifficulty, index)} style={{ width: "fit-content" }}>Remove</button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="admin-editor-footer" style={{ marginTop: 24 }}>
            <span>Total questions: {totalQuestions} | Easy: {quizQuestions.easy.length} | Medium: {quizQuestions.medium.length} | Hard: {quizQuestions.hard.length} | Normal: {quizQuestions.normal.length}</span>
            <div>
              <button type="button" className="secondary-button" onClick={() => setActiveQuizTab("list")}>Cancel</button>
              <button type="submit" className="primary-button" disabled={loading}>{loading ? "Saving..." : "Save Quiz"}</button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}