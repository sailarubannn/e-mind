"use client";

import { useEffect, useState, type FormEvent } from "react";
import { resolveOptionAnswer } from "@/lib/exam-answers";
import { academicLevel, gradeRange } from "@/lib/academic-eligibility";
import ExamQuestionEditor from "./ExamQuestionEditor";
import WrittenPaperManager from "./WrittenPaperManager";
import QuizExamManager from "./QuizExamManager";
import ExamMarksSheetManager from "./ExamMarksSheetManager";

type Resource = "users" | "books" | "videos" | "exams";
type ExamTab = "mcq" | "written" | "quiz" | "marks-sheets";
type Item = Record<string, unknown> & { id: string };
type ExamQuestion = { prompt: string; options: string[]; correctAnswer: string | null; imageUrl?: string | null; optionImages?: (string | null)[] };

const labels: Record<Resource, string> = { users: "Users", books: "Books", videos: "Videos", exams: "Exams" };
const fieldNames: Record<Resource, string[]> = {
  users: ["fullName", "email", "password", "role", "educationLevel", "grade", "stream"],
  books: ["title", "author", "subject", "level", "price", "imageUrl", "description"],
  videos: ["title", "subject", "level", "duration", "videoUrl", "thumbnail", "description"],
  exams: ["title", "subject", "educationLevel", "grade", "stream", "durationMins", "startsAt", "endsAt", "description", "questions"],
};

function dateTimeLocal(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function examState(item: Item) {
  if (!item.published) return "Draft";
  const now = Date.now();
  if (now < new Date(String(item.startsAt)).getTime()) return "Scheduled";
  if (now <= new Date(String(item.endsAt)).getTime()) return "Live";
  return "Completed";
}

function questionSignature(questions: ExamQuestion[]) {
  return JSON.stringify(questions.map((question) => ({
    prompt: question.prompt,
    options: question.options,
    correctAnswer: question.correctAnswer,
    imageUrl: question.imageUrl ?? null,
    optionImages: question.optionImages ?? [],
  })));
}

function readMediaFile(file: File, setValue: (value: string) => void) {
  if (file.size > 12 * 1024 * 1024) {
    window.alert("Uploaded media must be smaller than 12 MB. Use a web URL for larger files.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => setValue(typeof reader.result === "string" ? reader.result : "");
  reader.readAsDataURL(file);
}

function itemTitle(item: Item, resource: Resource) {
  if (resource === "users") return `${String(item.fullName)} · ${String(item.email)} · ${String(item.role)} · ${String(item.educationLevel ?? "Level not set")}${item.grade ? ` · Grade ${String(item.grade)}` : ""}${item.stream ? ` · ${String(item.stream)}` : ""} · Mobile: ${String(item.mobileNumber || "Not provided")}`;
  if (resource === "exams") return `${String(item.title)} · ${String((item.subject as { name?: string })?.name ?? item.subject)}`;
  return `${String(item.title)} · ${String(item.subject ?? "")}`;
}

function studentGroupLabel(item: Item) {
  const grade = Number(item.grade);
  const level = academicLevel(typeof item.educationLevel === "string" ? item.educationLevel : null);
  const range = level ? gradeRange(level) : null;
  const gradeIsValid = Number.isInteger(grade) && grade > 0
    && (!range || (grade >= range.min && grade <= range.max));
  const gradeLabel = gradeIsValid ? `Grade ${grade}` : "Grade not set";
  if (level === "O_LEVEL") return `O/L · ${gradeLabel}`;
  if (level === "A_LEVEL") return `A/L · ${gradeLabel}${typeof item.stream === "string" && item.stream.trim() ? ` · ${item.stream.trim()}` : ""}`;
  return gradeLabel;
}

export default function AdminDashboard({ onSignOut, adminName }: { onSignOut: () => void; adminName: string }) {
  const [active, setActive] = useState<Resource>("exams");
  const [examTab, setExamTab] = useState<ExamTab>("mcq");
  const [items, setItems] = useState<Item[]>([]);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [examFile, setExamFile] = useState<File | null>(null);
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [originalExamQuestions, setOriginalExamQuestions] = useState<ExamQuestion[]>([]);
  const [lockedQuestionCount, setLockedQuestionCount] = useState(0);
  const [questionEditorLocked, setQuestionEditorLocked] = useState(false);
  const [extractingQuestions, setExtractingQuestions] = useState(false);
  const [processingQuestionImage, setProcessingQuestionImage] = useState(false);
  const [viewingResults, setViewingResults] = useState<string | null>(null);
  const [selectedStudentGroup, setSelectedStudentGroup] = useState<string | null>(null);

  async function loadItems(resource: Resource) {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/${resource}`);
      const result = await response.json() as { items?: Item[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not load records.");
      setItems(result.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load records.");
    } finally {
      setLoading(false);
    }
  }

  // The active tab selects the external database collection shown here.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadItems(active); }, [active]);

  function openCreate() {
    setEditing(null);
    setForm({ role: "STUDENT", published: "false", educationLevel: active === "users" ? "GCE Ordinary Level (O/L)" : "A_LEVEL", grade: active === "users" ? "11" : "12" });
    setExamFile(null); setExamQuestions([]); setOriginalExamQuestions([]); setLockedQuestionCount(0); setQuestionEditorLocked(false); setStatus(""); setError("");
  }

  function openEdit(item: Item) {
    const next: Record<string, string> = {};
    fieldNames[active].forEach((key) => {
      const value = key === "subject" && typeof item[key] === "object" ? (item[key] as { name?: string }).name : item[key];
      next[key] = key === "startsAt" || key === "endsAt" ? dateTimeLocal(value) : String(value ?? "");
    });
    next.published = String(item.published ?? "false");
    const savedQuestions = Array.isArray(item.questions) ? (item.questions as ExamQuestion[]).filter((question) => question && typeof question.prompt === "string").map((question) => {
      const options = Array.isArray(question.options) ? question.options.map(String) : [];
      return { prompt: question.prompt, options, correctAnswer: resolveOptionAnswer(question.correctAnswer, options), imageUrl: typeof question.imageUrl === "string" ? question.imageUrl : null, optionImages: Array.isArray(question.optionImages) ? question.optionImages.map((image) => typeof image === "string" ? image : null) : [] };
    }) : [];
    const attempts = Array.isArray(item.attempts) ? item.attempts as Array<{ status?: string }> : [];
    setLockedQuestionCount(attempts.length ? savedQuestions.length : 0);
    setQuestionEditorLocked(attempts.some((attempt) => attempt.status === "IN_PROGRESS"));
    setEditing(item); setForm(next); setExamQuestions(savedQuestions); setOriginalExamQuestions(savedQuestions); setExamFile(null); setStatus(""); setError("");
  }

  function addManualQuestion() {
    setExamQuestions((current) => [...current, { prompt: "", options: ["", ""], correctAnswer: null }]);
    setStatus("Added a blank MCQ. Enter its question, options, and correct answer below.");
    setError("");
  }

  async function extractExamQuestions() {
    if (!examFile) {
      setError("Choose a PDF exam paper first.");
      return;
    }

    setExtractingQuestions(true); setError(""); setStatus("Scanning every page for questions and answer keys...");
    const formData = new FormData();
    formData.append("file", examFile);
    try {
      const response = await fetch("/api/admin/exams/upload", { method: "POST", body: formData });
      const result = await response.json() as { questions?: ExamQuestion[]; fileName?: string; error?: string; pagesScanned?: number | null; imagesScanned?: number | null };
      if (!response.ok || !result.questions) throw new Error(result.error ?? "The PDF could not be read.");
      setExamQuestions(result.questions);
      setForm((current) => ({ ...current, questions: result.questions?.map((question) => question.prompt).join("\n") ?? "" }));
      const scanSummary = result.pagesScanned ? `All ${result.pagesScanned} PDF pages scanned. ` : result.imagesScanned ? `${result.imagesScanned} document image${result.imagesScanned === 1 ? "" : "s"} scanned. ` : "";
      setStatus(`${scanSummary}${result.questions.length} questions extracted from ${result.fileName ?? examFile.name}. Questions, choices, and answers were identified separately and each answer was placed in its options automatically - review them before saving.`);
    } catch (extractError) {
      setStatus("");
      setError(extractError instanceof Error ? extractError.message : "The PDF could not be read.");
    } finally {
      setExtractingQuestions(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const payload: Record<string, unknown> = { ...form };
    if (active === "books") payload.price = Number(form.price);
    if (active === "exams") {
      payload.durationMins = Number(form.durationMins);
      const questionsChanged = !editing || questionSignature(examQuestions) !== questionSignature(originalExamQuestions);
      if (questionsChanged) {
        const questionsToValidate = editing && lockedQuestionCount > 0 ? examQuestions.slice(lockedQuestionCount) : examQuestions;
        const questionIssues = questionsToValidate.flatMap((question, index) => {
          const options = question.options.map((option) => option.trim());
          const reasons: string[] = [];
          if (!question.prompt.trim()) reasons.push("add a prompt");
          if (options.filter((option, optionIndex) => Boolean(option) || Boolean(question.optionImages?.[optionIndex])).length < 2) reasons.push("add at least two options or option images");
          const firstEmpty = options.findIndex((option, optionIndex) => !option && !question.optionImages?.[optionIndex]);
          if (firstEmpty >= 0 && options.slice(firstEmpty + 1).some((option, offset) => Boolean(option) || Boolean(question.optionImages?.[firstEmpty + 1 + offset]))) reasons.push("fill options in order without gaps");
          const answerIndex = question.correctAnswer ? question.correctAnswer.charCodeAt(0) - 65 : -1;
          if (answerIndex < 0 || (!options[answerIndex] && !question.optionImages?.[answerIndex])) reasons.push("select a correct answer that has an option or option image");
          return reasons.length ? [`Question ${lockedQuestionCount + index + 1}: ${reasons.join(", ")}.`] : [];
        });
        if ((questionsToValidate.length === 0 && (!editing || lockedQuestionCount === 0)) || questionIssues.length > 0) {
          setError(questionIssues.length ? questionIssues.join(" ") : "Add at least one complete question before saving.");
          setLoading(false);
          return;
        }
        payload.questions = examQuestions.map((question) => ({
          ...question,
          prompt: question.prompt.trim(),
          options: question.options.map((option) => option.trim()),
        }));
      } else {
        delete payload.questions;
      }
    }
    payload.published = form.published === "true";
    if (active === "users") delete payload.published;
    if (editing && active === "users") delete payload.email;
    try {
      const response = await fetch(`/api/admin/${active}${editing ? `/${editing.id}` : ""}`, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save record.");
      setStatus(editing ? "Changes saved successfully." : "Record created successfully."); setEditing(null); setForm({}); setExamFile(null); setExamQuestions([]); await loadItems(active);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save record.");
    } finally { setLoading(false); }
  }

  async function remove(item: Item) {
    const attemptCount = Array.isArray(item.attempts) ? item.attempts.length : 0;
    const impact = active === "exams" && attemptCount > 0 ? ` This permanently removes ${attemptCount} student attempt${attemptCount === 1 ? "" : "s"} and their marks.` : "";
    if (!window.confirm(`Delete ${itemTitle(item, active)}?${impact}`)) return;
    try {
      const response = await fetch(`/api/admin/${active}/${item.id}`, { method: "DELETE", credentials: "same-origin" });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setError(result.error ?? "Could not delete this item. Please try again."); return; }
      setStatus("Record deleted successfully."); await loadItems(active);
    } catch {
      setError("Could not delete this item. Check your connection and try again.");
    }
  }

  async function removeAttempt(exam: Item, attempt: { id: string; user: { fullName: string; email: string } }) {
    const examName = String(exam.title ?? "this exam");
    if (!window.confirm(`Remove ${attempt.user.fullName} (${attempt.user.email}) from ${examName}? Their answers and marks will be deleted, and they will be able to attempt the exam again.`)) return;
    setError(""); setStatus("");
    try {
      const response = await fetch(`/api/admin/exams/${exam.id}/attempts/${attempt.id}`, { method: "DELETE", credentials: "same-origin" });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setError(result.error ?? "Could not remove this student attempt. Please try again."); return; }
      setStatus(`${attempt.user.fullName}'s attempt was removed. They can attempt this exam again.`);
      await loadItems(active);
    } catch {
      setError("Could not remove this student attempt. Check your connection and try again.");
    }
  }

  function renderRecord(item: Item) {
    const attempts = Array.isArray(item.attempts) ? item.attempts as Array<{ id: string; status: string; startedAt: string; submittedAt: string | null; answerFileName: string | null; user: { fullName: string; email: string; mobileNumber: string | null }; result: { obtainedMarks: number; totalMarks: number | null; percentage: number; passed: boolean } | null }> : [];
    return <div key={item.id}>
      <article className="admin-record">
        <div>
          <strong>{itemTitle(item, active)}</strong>
          <small>{active === "exams" ? `${examState(item)} · ${new Date(String(item.startsAt)).toLocaleString()} – ${new Date(String(item.endsAt)).toLocaleString()} · ${attempts.length} student${attempts.length === 1 ? "" : "s"} started` : item.published ? "Published" : "Draft"}</small>
        </div>
        <div className="admin-record-actions">
          {active === "exams" && <button onClick={() => setViewingResults(viewingResults === item.id ? null : item.id)}>{viewingResults === item.id ? "Hide students" : "View students & marks"}</button>}
          <button onClick={() => openEdit(item)}>Edit</button>
          <button className="danger-button" onClick={() => void remove(item)}>Delete</button>
        </div>
      </article>
      {active === "exams" && viewingResults === item.id && <div className="admin-results">
        <div className="admin-results-summary">
          <strong>{attempts.length} student{attempts.length === 1 ? "" : "s"} participated</strong>
          <span>{attempts.filter((attempt) => attempt.result).length} submitted · {attempts.filter((attempt) => attempt.status === "IN_PROGRESS").length} in progress</span>
        </div>
        {attempts.length === 0 ? <p className="admin-empty">No students have started this exam.</p> : <div className="admin-results-table-wrap">
          <table className="admin-results-table">
            <thead><tr><th>Student</th><th>Email</th><th>Mobile</th><th>Status</th><th>Started</th><th>Submitted</th><th>Answer sheet</th><th>Marks</th><th>Score</th><th>Admin action</th></tr></thead>
            <tbody>{attempts.map((attempt) => <tr key={attempt.id}>
              <td>{attempt.user.fullName}</td>
              <td>{attempt.user.email}</td>
              <td>{attempt.user.mobileNumber || "Not provided"}</td>
              <td>{attempt.result ? attempt.result.passed ? "Passed" : "Submitted" : attempt.status === "IN_PROGRESS" ? "In progress" : "Expired"}</td>
              <td>{new Date(attempt.startedAt).toLocaleString()}</td>
              <td>{attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : "—"}</td>
              <td>{attempt.answerFileName ? <a href={`/api/admin/exams/${item.id}/attempts/${attempt.id}/answer-sheet`}>Download {attempt.answerFileName}</a> : "—"}</td>
              <td>{attempt.result ? `${attempt.result.obtainedMarks} / ${attempt.result.totalMarks ?? String(item.totalMarks)}` : "Pending"}</td>
              <td>{attempt.result ? `${attempt.result.percentage.toFixed(1)}%` : "—"}</td>
              <td><button type="button" className="danger-button" onClick={() => void removeAttempt(item, attempt)}>Remove attempt</button></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>}
    </div>;
  }

  const students = items.filter((item) => String(item.role).toUpperCase() === "STUDENT");
  const otherAccounts = items.filter((item) => String(item.role).toUpperCase() !== "STUDENT");
  const studentGroupsMap = new Map<string, Item[]>();
  for (const student of students) {
    const label = studentGroupLabel(student);
    studentGroupsMap.set(label, [...(studentGroupsMap.get(label) ?? []), student]);
  }
  const studentGroups = [...studentGroupsMap.entries()].sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }));
  if (otherAccounts.length > 0) studentGroups.push(["Other accounts", otherAccounts]);
  const activeStudentGroup = studentGroups.some(([label]) => label === selectedStudentGroup)
    ? selectedStudentGroup
    : studentGroups[0]?.[0] ?? null;

  return <main className="admin-shell">
    <aside className="admin-sidebar"><div className="brand"><span className="brand-mark">e</span><span>E-mind</span></div><div className="admin-label">ADMIN CONSOLE</div><nav className="admin-nav" aria-label="Admin navigation">{(Object.keys(labels) as Resource[]).map((resource) => <button key={resource} className={active === resource ? "active" : ""} onClick={() => { setActive(resource); setEditing(null); setForm({}); }}>{labels[resource]}</button>)}</nav><button className="admin-signout" onClick={onSignOut}>Sign out <span>↗</span></button></aside>
    <section className="admin-content"><header className="admin-topbar"><div><span className="eyebrow">E-mind SRI LANKA</span><h1>Content administration</h1></div><div className="admin-identity"><span className="admin-avatar">{adminName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}</span><div><strong>{adminName}</strong><small>Administrator</small></div></div></header>
      <div className="admin-page-content">{active === "exams" && <nav className="admin-subtabs" aria-label="Exam management sections"><button type="button" className={examTab === "mcq" ? "active" : ""} onClick={() => setExamTab("mcq")}>MCQ exams</button><button type="button" className={examTab === "written" ? "active" : ""} onClick={() => setExamTab("written")}>Essay & structured papers</button><button type="button" className={examTab === "quiz" ? "active" : ""} onClick={() => setExamTab("quiz")}>Quiz exams</button><button type="button" className={examTab === "marks-sheets" ? "active" : ""} onClick={() => setExamTab("marks-sheets")}>Marks sheets</button></nav>}{active === "exams" && examTab === "written" && <WrittenPaperManager />}{active === "exams" && examTab === "quiz" && <QuizExamManager />}{active === "exams" && examTab === "marks-sheets" && <ExamMarksSheetManager />}<div hidden={active === "exams" && examTab !== "mcq"}><div className="admin-page-heading"><div><p className="eyebrow">CONTENT MANAGEMENT</p><h2>Manage {labels[active].toLowerCase()}</h2><p>{active === "exams" ? "Manage exam schedules, monitor participation, and review each student’s marks." : "Add, edit, publish, and delete content."}</p></div><button className="primary-button" onClick={openCreate}>+ Add {labels[active].slice(0, -1)}</button></div>
        {status && <p className="admin-upload-status">{status}</p>}{error && <p className="admin-upload-error">{error}</p>}
        {(editing || Object.keys(form).length > 0) && <form className="admin-editor admin-crud-form" onSubmit={submit}><div className="admin-editor-fields">{fieldNames[active].filter((key) => !(active === "exams" && key === "questions")).map((key) => <label key={key}>{key === "questions" ? "Extracted MCQ prompts" : key === "imageUrl" ? "Book image URL or upload" : key === "videoUrl" ? "Video URL or upload" : key === "educationLevel" ? "Education level" : key === "grade" ? "Grade" : key === "stream" ? "Stream" : key}{key === "questions" || key === "description" ? <textarea rows={key === "questions" ? 5 : 3} readOnly={key === "questions"} value={form[key] ?? ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /> : key === "role" ? <select value={form[key] ?? "STUDENT"} onChange={(event) => setForm({ ...form, [key]: event.target.value })}><option>STUDENT</option><option>TEACHER</option><option>ADMIN</option></select> : key === "educationLevel" ? <select required={active !== "users" || form.role === "STUDENT"} value={form[key] || (active === "users" ? "GCE Ordinary Level (O/L)" : "A_LEVEL")} onChange={(event) => setForm({ ...form, [key]: event.target.value, grade: "", stream: "" })}>{active === "users" ? <><option value="Grade 6–11">Grade 6–11</option><option value="GCE Ordinary Level (O/L)">GCE Ordinary Level (O/L)</option><option value="GCE Advanced Level (A/L)">GCE Advanced Level (A/L)</option></> : <><option value="GRADE">Grade 6–11</option><option value="O_LEVEL">O Level</option><option value="A_LEVEL">A Level</option></>}</select> : <><input required={!((editing && key === "password") || key === "thumbnail" || (key === "grade" && active === "users" && form.role !== "STUDENT") || (key === "grade" && active !== "users" && active !== "exams") || (key === "stream" && ((active === "users" && form.role !== "STUDENT") || academicLevel(form.educationLevel) !== "A_LEVEL")))} min={key === "durationMins" ? 1 : key === "grade" ? gradeRange(academicLevel(form.educationLevel) ?? "GRADE").min : undefined} max={key === "durationMins" ? 600 : key === "grade" ? gradeRange(academicLevel(form.educationLevel) ?? "GRADE").max : undefined} type={key === "password" ? "password" : key.includes("At") ? "datetime-local" : key === "price" || key.includes("Mins") || key === "grade" || key === "totalMarks" ? "number" : "text"} value={form[key] ?? ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />{(key === "imageUrl" || key === "videoUrl") && <input type="file" accept={key === "imageUrl" ? "image/*" : "video/*"} onChange={(event) => { const file = event.target.files?.[0]; if (file) readMediaFile(file, (value) => setForm((current) => ({ ...current, [key]: value }))); }} />}</>}</label>)}{active === "exams" && <label>Question paper PDF, DOCX, or image<input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp" onChange={(event) => setExamFile(event.target.files?.[0] ?? null)} disabled={lockedQuestionCount > 0 || questionEditorLocked} /><button type="button" className="secondary-button" onClick={() => void extractExamQuestions()} disabled={lockedQuestionCount > 0 || questionEditorLocked || !examFile || extractingQuestions}>{extractingQuestions ? "Extracting..." : "Extract MCQ questions"}</button><small>Every PDF page is scanned. Scanned English, Sinhala, and Tamil papers are supported.</small></label>}{active !== "users" && <label>Published<select value={form.published ?? "false"} onChange={(event) => setForm({ ...form, published: event.target.value })}><option value="false">Draft</option><option value="true">Published</option></select></label>}</div>{active === "exams" && <>{editing && Number(editing.attemptCount ?? (Array.isArray(editing.attempts) ? editing.attempts.length : 0)) > 0 && <p className="admin-upload-status">{questionEditorLocked ? "A student is taking this exam. Wait until current attempts are submitted before adding questions." : "Existing questions and marks are protected. Add new questions at the end of the list."}</p>}<ExamQuestionEditor questions={examQuestions} onChange={setExamQuestions} onAdd={addManualQuestion} locked={questionEditorLocked} lockedCount={lockedQuestionCount} onProcessingChange={setProcessingQuestionImage} /></>}<div className="admin-editor-footer"><span>{status || (editing ? "Update this record." : "Create a new record.")}</span><div><button type="button" className="secondary-button" onClick={() => { setEditing(null); setForm({}); setExamFile(null); setExamQuestions([]); }}>Cancel</button><button type="submit" className="primary-button" disabled={loading || extractingQuestions || processingQuestionImage}>{processingQuestionImage ? "Processing question image..." : editing ? "Save changes" : "Create record"}</button></div></div></form>}
        <section className="admin-record-list"><div className="admin-record-list-head"><strong>{active === "users" && !loading ? `${students.length} students · ${otherAccounts.length} other accounts` : `${items.length} ${labels[active].toLowerCase()}`}</strong><button className="secondary-button" onClick={() => void loadItems(active)}>Refresh</button></div>{loading ? <p className="admin-empty">Loading records...</p> : items.length === 0 ? <p className="admin-empty">No records yet.</p> : active === "users" ? studentGroups.length === 0 ? <p className="admin-empty">No students or other accounts to show.</p> : <div className="admin-student-groups">
          <nav className="admin-student-tabs" role="tablist" aria-label="Students by grade">
            {studentGroups.map(([label, groupItems], index) => <button
              type="button"
              role="tab"
              id={`student-tab-${index}`}
              aria-selected={activeStudentGroup === label}
              aria-controls={`student-panel-${index}`}
              className={activeStudentGroup === label ? "active" : ""}
              key={label}
              onClick={() => setSelectedStudentGroup(label)}
            >{label}<span>{groupItems.length}</span></button>)}
          </nav>
          {studentGroups.map(([label, groupItems], index) => activeStudentGroup === label && <section
            className="admin-student-tab-panel"
            role="tabpanel"
            id={`student-panel-${index}`}
            aria-labelledby={`student-tab-${index}`}
            key={label}
          >
            {groupItems.map(renderRecord)}
          </section>)}
        </div> : items.map(renderRecord)}</section>
      </div></div></section>
  </main>;
}
