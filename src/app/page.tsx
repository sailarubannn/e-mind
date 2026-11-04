"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import ExamQuestionEditor from "./admin/ExamQuestionEditor";
import WrittenPaperAttempt from "./WrittenPaperAttempt";
import StudentProgress from "./StudentProgress";
import StudentNotifications from "./StudentNotifications";
import { gradesForEducationLevel, isAcademicProfileComplete, matchesAcademicAudience, academicLevel } from "@/lib/academic-eligibility";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (element: HTMLElement, options: { theme: string; size: string; width: number }) => void;
        };
      };
    };
  }
}

type VideoCard = { id: string; title: string; subject: string; level: string; duration: string; color: string; image: string; videoUrl: string };
type LandingStats = { activeStudents: number; practiceExams: number };
type StudentProgressSummary = {
  overallAverage: number | null;
  completedCount: number;
  subjects: { subject: string; averagePercentage: number; examsCompleted: number }[];
  recommendations: { subject: string; averagePercentage: number; message: string }[];
};

function isLandingStats(value: unknown): value is LandingStats {
  if (!value || typeof value !== "object") return false;
  return "activeStudents" in value && "practiceExams" in value
    && Number.isInteger(value.activeStudents) && Number.isInteger(value.practiceExams);
}

const streamSubjects: Record<string, string[]> = {
  "Biological Science": ["Biology", "Chemistry", "Physics"],
  "Physical Science": ["Combined Mathematics", "Physics", "Chemistry"],
  "Commerce": ["Accounting", "Business Studies", "Economics"],
  "Technology": ["Engineering Technology", "Science for Technology", "Information & Communication Technology"],
};

type BookCard = { id: string; title: string; author: string; subject: string; level: string; price: string; color: string; imageUrl: string };
type ExtractedExamQuestion = { prompt: string; options: string[]; correctAnswer: string | null; imageUrl?: string | null; optionImages?: (string | null)[] };
type PublishedWrittenPaper = { id: string; title: string; subject: string; educationLevel: string; grade: number | null; stream: string | null; fileName: string; durationMins: number; answerSchemePublished: boolean };
type LearningShowcaseCard = { title: string; description: string; summary: string; image: string; icon: string; destination: string | null; actionLabel: string };

const assistantReplies: Record<string, string> = {
  exams: "You have two upcoming examinations. Combined Mathematics is on 18 Sep at 09:00 AM, followed by Physics on 24 Sep at 02:00 PM.",
  learning: "Your current focus is Physics vectors. You are at 68% and have three lessons remaining in this learning path.",
  books: "Open Book shop from the sidebar to browse revision guides and practice papers. You can add books to your basket and checkout there.",
  account: "You can update your profile and learning preferences from Settings. Use your profile menu when you are ready to sign out.",
};

const translations = {
  English: { overview: "Overview", learning: "My learning", examinations: "Examinations", progress: "Progress", shop: "Book shop", settings: "Settings", signIn: "Sign in to your space", createSpace: "Create your student space", welcome: "WELCOME BACK", continue: "Continue your learning journey.", notifications: "Notifications", profile: "View profile", assistant: "E-mind assistant", support: "Here to help", ask: "Ask for support...", saved: "Settings saved", save: "Save settings", account: "ACCOUNT", preferences: "PREFERENCES", language: "Language" },
  "සිංහල": { overview: "සමස්ත දසුන", learning: "මගේ ඉගෙනීම", examinations: "විභාග", progress: "ප්‍රගතිය", shop: "පොත් සාප්පුව", settings: "සැකසුම්", signIn: "ඔබේ අවකාශයට ඇතුළු වන්න", createSpace: "ඔබේ ශිෂ්‍ය අවකාශය සාදන්න", welcome: "ආයුබෝවන්", continue: "ඔබේ ඉගෙනුම් ගමන දිගටම කරගෙන යන්න.", notifications: "දැනුම්දීම්", profile: "පැතිකඩ බලන්න", assistant: "E-mind සහායක", support: "උදව් කිරීමට සූදානම්", ask: "උදව් සඳහා විමසන්න...", saved: "සැකසුම් සුරකින ලදී", save: "සැකසුම් සුරකින්න", account: "ගිණුම", preferences: "මනාප", language: "භාෂාව" },
  "தமிழ்": { overview: "மேலோட்டம்", learning: "என் கற்றல்", examinations: "பரீட்சைகள்", progress: "முன்னேற்றம்", shop: "புத்தகக் கடை", settings: "அமைப்புகள்", signIn: "உங்கள் இடத்தில் உள்நுழையுங்கள்", createSpace: "உங்கள் மாணவர் இடத்தை உருவாக்குங்கள்", welcome: "மீண்டும் வரவேற்கிறோம்", continue: "உங்கள் கற்றல் பயணத்தைத் தொடருங்கள்.", notifications: "அறிவிப்புகள்", profile: "சுயவிவரத்தைக் காண்க", assistant: "E-mind உதவியாளர்", support: "உதவ தயாராக உள்ளது", ask: "உதவி கேளுங்கள்...", saved: "அமைப்புகள் சேமிக்கப்பட்டன", save: "அமைப்புகளைச் சேமி", account: "கணக்கு", preferences: "விருப்பங்கள்", language: "மொழி" },
} as const;

const pageTranslationRows = [
  ["LEARNING, IN MOTION", "ඉගෙනීම, චලනයේ", "கற்றல், இயக்கத்தில்"], ["Your next breakthrough starts here.", "ඔබේ ඊළඟ ජයග්‍රහණය මෙතැනින් ආරම්භ වේ.", "உங்கள் அடுத்த முன்னேற்றம் இங்கே தொடங்குகிறது."], ["One focused space for Sri Lankan students to learn with purpose, practise with confidence, and see their progress clearly.", "ශ්‍රී ලාංකික සිසුන්ට අරමුණකින් ඉගෙනීමට, විශ්වාසයෙන් පුහුණු වීමට සහ ප්‍රගතිය පැහැදිලිව දැකීමට එක් ස්ථානයක්.", "இலங்கை மாணவர்கள் நோக்கத்துடன் கற்கவும், நம்பிக்கையுடன் பயிற்சி செய்யவும், முன்னேற்றத்தைத் தெளிவாகக் காணவும் ஒரே இடம்."], ["Built around your goals", "ඔබේ ඉලක්ක වටා ගොඩනගා ඇත", "உங்கள் இலக்குகளைச் சுற்றி உருவாக்கப்பட்டது"], ["Personalised learning paths for every subject, stream, and stage.", "සෑම විෂයකටම, ධාරාවකටම සහ අදියරකටම පුද්ගලීකරණය කළ ඉගෙනුම් මාර්ග.", "ஒவ்வொரு பாடம், பிரிவு மற்றும் நிலையிற்கும் தனிப்பயன் கற்றல் பாதைகள்."], ["STUDENT SPACE", "ශිෂ්‍ය අවකාශය", "மாணவர் இடம்"], ["WELCOME BACK", "නැවත සාදරයෙන් පිළිගනිමු", "மீண்டும் வரவேற்கிறோம்"], ["Sign in as student", "ශිෂ්‍යයෙකු ලෙස ඇතුළු වන්න", "மாணவராக உள்நுழைக"], ["Create an account", "ගිණුමක් සාදන්න", "கணக்கை உருவாக்கு"], ["Forgot password?", "මුරපදය අමතකද?", "கடவுச்சொல்லை மறந்துவிட்டீர்களா?"], ["Good morning, Nethmi", "සුභ උදෑසනක්, නෙත්මි", "காலை வணக்கம், நேத்மி"], ["Keep learning", "ඉගෙනීම දිගටම කරගෙන යන්න", "தொடர்ந்து கற்றுக்கொள்ளுங்கள்"], ["Upcoming examinations", "ඉදිරි විභාග", "வரவிருக்கும் பரீட்சைகள்"], ["Subject strengths", "විෂය ශක්තීන්", "பாட வலிமைகள்"], ["See all recommendations", "සියලු නිර්දේශ බලන්න", "அனைத்து பரிந்துரைகளையும் காண்க"], ["View calendar", "දින දර්ශනය බලන්න", "நாட்காட்டியைக் காண்க"], ["Stay on track", "මාර්ගයේ රැඳී සිටින්න", "பாதையில் தொடருங்கள்"], ["YOUR PROGRESS", "ඔබේ ප්‍රගතිය", "உங்கள் முன்னேற்றம்"], ["Book shop", "පොත් සාප්පුව", "புத்தகக் கடை"], ["Get trusted revision guides and practice papers delivered to you.", "විශ්වාසදායක පුනරීක්ෂණ මාර්ගෝපදේශ සහ පුහුණු ප්‍රශ්න පත්‍ර ලබා ගන්න.", "நம்பகமான மீளாய்வு வழிகாட்டிகள் மற்றும் பயிற்சி வினாத்தாள்களைப் பெறுங்கள்."], ["Add to basket", "බාස්කට්ටුවට එක් කරන්න", "கூடையில் சேர்"], ["Checkout", "ගෙවීම", "செலுத்துதல்"], ["Settings", "සැකසුම්", "அமைப்புகள்"], ["Profile details", "පැතිකඩ විස්තර", "சுயவிவர விவரங்கள்"], ["Learning experience", "ඉගෙනුම් අත්දැකීම", "கற்றல் அனுபவம்"], ["Study reminders", "අධ්‍යයන මතක් කිරීම්", "படிப்பு நினைவூட்டல்கள்"], ["Compact layout", "සංක්ෂිප්ත පිරිසැලසුම", "சுருக்கமான அமைப்பு"], ["Save settings", "සැකසුම් සුරකින්න", "அமைப்புகளைச் சேமி"], ["Notifications", "දැනුම්දීම්", "அறிவிப்புகள்"], ["Mark all as read", "සියල්ල කියවූ ලෙස සලකුණු කරන්න", "அனைத்தையும் படித்ததாகக் குறிக்கவும்"], ["All caught up", "සියල්ල යාවත්කාලීනයි", "அனைத்தும் படிக்கப்பட்டது"], ["Here to help", "උදව් කිරීමට සූදානම්", "உதவ தயாராக உள்ளது"], ["Ask for support...", "සහාය සඳහා විමසන්න...", "ஆதரவைக் கேளுங்கள்..."], ["My exams", "මගේ විභාග", "என் பரீட்சைகள்"], ["Learning help", "ඉගෙනුම් උදව්", "கற்றல் உதவி"], ["Where are the books?", "පොත් කොහේද?", "புத்தகங்கள் எங்கே?"], ["Send message", "පණිවිඩය යවන්න", "செய்தியை அனுப்பு"] ,
] as const;

type ExamQuestion = { id: string; prompt: string; imageUrl?: string | null; optionImages?: (string | null)[]; options: string[]; marks: number; type: string };
type ExamReviewQuestion = { questionId: string; prompt: string; imageUrl?: string | null; optionImages?: (string | null)[]; options: string[]; selectedAnswer: string | null; correctAnswer: string; isCorrect: boolean };
type ExamResult = { obtainedMarks: number; totalMarks: number; percentage: number; passed: boolean; review: ExamReviewQuestion[] };
type StudentAttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
type ContentExam = { id: string; title: string; startsAt: string; endsAt: string; durationMins: number; educationLevel: string; grade: number | null; stream: string | null; isQuiz?: boolean; canRetake?: boolean; studentAttemptStatus?: StudentAttemptStatus | null; subject: { name: string }; questions: ExamQuestion[] };
type PublishedExam = { id: string; title: string; subject: string; startsAt: string; endsAt: string; date: string; time: string; duration: string; durationMins: number; educationLevel: string; grade: number | null; stream: string | null; tone: string; questions: ExamQuestion[]; fileName: string; isQuiz: boolean; canRetake: boolean; studentAttemptStatus?: StudentAttemptStatus | null };

function mapContentExam(exam: ContentExam): PublishedExam {
  const start = new Date(exam.startsAt);
  return {
    id: exam.id,
    title: exam.title,
    subject: exam.subject.name,
    startsAt: exam.startsAt,
    endsAt: exam.endsAt,
    date: start.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    time: start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    duration: `${exam.durationMins} min`,
    durationMins: exam.durationMins,
    educationLevel: exam.educationLevel,
    grade: exam.grade,
    stream: exam.stream,
    tone: "mint",
    questions: exam.questions,
    fileName: "Online exam",
    isQuiz: exam.isQuiz ?? false,
    canRetake: exam.canRetake ?? Boolean(exam.isQuiz),
    studentAttemptStatus: exam.studentAttemptStatus,
  };
}

function VideoPlayerModal({ video, onClose }: { video: VideoCard; onClose: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}><section className="video-player-modal" role="dialog" aria-modal="true" aria-labelledby="video-player-title" onClick={(event) => event.stopPropagation()}><div className="video-player-head"><div><span className="eyebrow">NOW PLAYING · {video.subject}</span><h2 id="video-player-title">{video.title}</h2></div><button className="close-button" onClick={onClose} aria-label="Close video player">×</button></div><video className="video-player" controls autoPlay playsInline poster={video.image} src={video.videoUrl}>Your browser does not support video playback.</video><div className="video-player-foot"><span>{video.level}</span><span>{video.duration} lesson</span></div></section></div>;
}

function ExamUploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [grade, setGrade] = useState("");
  const [duration, setDuration] = useState("60 min");
  const [questions, setQuestions] = useState<ExtractedExamQuestion[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const addManualQuestion = () => setQuestions((current) => [...current, { prompt: "", options: ["", ""], correctAnswer: null }]);

  const extractQuestions = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) { setError("Choose a PDF or DOCX exam paper first."); return; }
    setUploading(true); setError(""); setStatus("Scanning every page for questions and answer keys...");
    const formData = new FormData(); formData.append("file", file);
    try {
      const response = await fetch("/api/admin/exams/upload", { method: "POST", body: formData });
      const result = await response.json() as { questions?: ExtractedExamQuestion[]; error?: string; fileName?: string; pagesScanned?: number | null; imagesScanned?: number | null };
      if (!response.ok || !result.questions) throw new Error(result.error ?? "The file could not be read.");
      const scanSummary = result.pagesScanned ? `All ${result.pagesScanned} PDF pages scanned. ` : result.imagesScanned ? `${result.imagesScanned} document image${result.imagesScanned === 1 ? "" : "s"} scanned. ` : "";
      setQuestions(result.questions); setStatus(`${scanSummary}${result.questions.length} questions extracted from ${result.fileName}. Review the options and fill in any missing choices or answers before publishing.`);
    } catch (uploadError) { setStatus(""); setError(uploadError instanceof Error ? uploadError.message : "The upload failed."); }
    finally { setUploading(false); }
  };

  const publishExam = async () => {
    const incompleteQuestion = questions.some((question) => { const options = question.options.map((option) => option.trim()); const firstEmpty = options.indexOf(""); return !question.prompt.trim() || options.filter(Boolean).length < 2 || (firstEmpty >= 0 && options.slice(firstEmpty).some(Boolean)) || !question.correctAnswer || !options[question.correctAnswer.charCodeAt(0) - 65]; });
    if (!title || !subject || !startsAt || !endsAt || !grade || questions.length === 0 || incompleteQuestion) { setError("Add the exam details and complete every question with at least two consecutive options and a correct answer before publishing."); return; }
    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
      setError("Choose a valid exam end date and time after the start date and time.");
      return;
    }
    setUploading(true); setError("");
    try {
      const response = await fetch("/api/admin/exams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, subject, educationLevel: "GRADE", grade: Number(grade), durationMins: Number.parseInt(duration, 10), totalMarks: questions.length, startsAt: startDate.toISOString(), endsAt: endDate.toISOString(), published: true, questions }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The exam could not be published.");
      setStatus("Exam published successfully and is now available to students.");
    } catch (publishError) { setError(publishError instanceof Error ? publishError.message : "The exam could not be published."); }
    finally { setUploading(false); }
  };

  return <section className="admin-form-page"><div className="admin-page-heading"><div><p className="eyebrow">ADMIN ONLY · PDF / DOCX EXTRACTION</p><h2>Exam paper manager</h2><p>Upload a paper, review the extracted questions, then publish it to students.</p></div><span className={status.includes("Published") ? "publish-status live" : "publish-status"}>{status.includes("Published") ? "Published" : "Draft"}</span></div><form className="admin-editor" onSubmit={extractQuestions}><div className="admin-editor-fields"><label>Paper title<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Term 03 Biology Paper" /></label><label>Subject<input required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Biology" /></label><label>Grade<select required value={grade} onChange={(event) => setGrade(event.target.value)}><option value="">Select grade</option>{[6, 7, 8, 9, 10, 11].map((value) => <option key={value} value={value}>Grade {value}</option>)}</select></label><label>Start date and time<input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label>End date and time<input required type="datetime-local" min={startsAt || undefined} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label><label>Duration<select value={duration} onChange={(event) => setDuration(event.target.value)}><option>60 min</option><option>90 min</option><option>120 min</option><option>180 min</option></select></label><label className="admin-upload-field">Exam paper file<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><small>Optional when entering questions manually. Every PDF page is scanned. Text-based files work best.</small></label></div>{error && <p className="admin-upload-error">{error}</p>}{status && !status.includes("Published") && <p className="admin-upload-status">{status}</p>}<ExamQuestionEditor questions={questions} onChange={setQuestions} onAdd={addManualQuestion} /><div className="admin-editor-footer"><span>{questions.length > 0 ? "Review the extracted questions and answers before publishing." : "Questions remain private until you publish this paper."}</span><div><button type="submit" className="secondary-button" disabled={uploading}>{uploading ? "Reading file..." : "Extract questions"}</button><button type="button" className="primary-button" disabled={questions.length === 0} onClick={publishExam}>Publish to students →</button></div></div></form></section>;
}

function AdminForm({ title, description, fields, published, onPublish }: { title: string; description: string; fields: string[]; published: boolean; onPublish: () => void }) {
  if (title === "Exam paper manager") return <ExamUploadForm />;
  return <section className="admin-form-page"><div className="admin-page-heading"><div><p className="eyebrow">ADMIN ONLY</p><h2>{title}</h2><p>{description}</p></div><span className={published ? "publish-status live" : "publish-status"}>{published ? "Published" : "Draft"}</span></div><form className="admin-editor" onSubmit={(event) => { event.preventDefault(); onPublish(); }}><div className="admin-editor-fields">{fields.map((field) => <label key={field}>{field}<input required placeholder={`Enter ${field.toLowerCase()}`} /></label>)}<label>Description<textarea rows={4} placeholder="Add a short description for students" /></label></div><div className="admin-editor-footer"><span>{published ? "This content is live in the student portal." : "Save as a draft or publish when ready."}</span><div><button type="button" className="secondary-button">Save draft</button><button type="submit" className="primary-button">{published ? "Published ✓" : "Publish to students →"}</button></div></div></form></section>;
}

export function AdminDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [activeSection, setActiveSection] = useState<"overview" | "exams" | "books" | "videos">("overview");
  const [examPublished, setExamPublished] = useState(false);
  const [bookPublished, setBookPublished] = useState(false);
  const [videoPublished, setVideoPublished] = useState(false);
  const sections = [["overview", "Overview", "⌂"], ["exams", "Exam papers", "▣"], ["books", "Books", "▤"], ["videos", "Videos", "▶"]] as const;

  return <main className="admin-shell"><aside className="admin-sidebar"><div className="brand"><span className="brand-mark">e</span><span>E-mind</span></div><div className="admin-label">ADMIN CONSOLE</div><nav className="admin-nav" aria-label="Admin navigation">{sections.map(([section, label, icon]) => <button key={section} className={activeSection === section ? "active" : ""} onClick={() => setActiveSection(section)}><span>{icon}</span>{label}</button>)}</nav><button className="admin-signout" onClick={onSignOut}>Sign out <span>↗</span></button></aside><section className="admin-content"><header className="admin-topbar"><div><span className="eyebrow">E-mind SRI LANKA</span><h1>Content administration</h1></div><div className="admin-identity"><span className="admin-avatar">AD</span><div><strong>E-mind Admin</strong><small>Full publishing access</small></div></div></header><div className="admin-page-content">{activeSection === "overview" && <><section className="admin-welcome"><div><p className="eyebrow">CONTROL CENTRE</p><h2>Keep the learning library moving.</h2><p>Only administrators can publish exam papers, books, and video lessons for students.</p></div><span className="admin-lock">⌘</span></section><section className="admin-stats"><div><span>LIVE EXAM PAPERS</span><strong>12</strong><small>2 drafts waiting</small></div><div><span>PUBLISHED BOOKS</span><strong>28</strong><small>4 added this month</small></div><div><span>VIDEO LESSONS</span><strong>46</strong><small>6 pending review</small></div></section><div className="admin-section-grid"><button className="admin-action-card" onClick={() => setActiveSection("exams")}><span className="admin-action-icon">▣</span><strong>Manage exam papers</strong><small>Upload papers, set schedules, and publish assessments.</small><span className="admin-action-link">Open manager →</span></button><button className="admin-action-card" onClick={() => setActiveSection("books")}><span className="admin-action-icon">▤</span><strong>Publish books</strong><small>Add trusted revision guides to the student book shop.</small><span className="admin-action-link">Open manager →</span></button><button className="admin-action-card" onClick={() => setActiveSection("videos")}><span className="admin-action-icon">▶</span><strong>Add video lessons</strong><small>Publish curated lessons to student learning spaces.</small><span className="admin-action-link">Open manager →</span></button></div></>}{activeSection === "exams" && <AdminForm title="Exam paper manager" description="Create and publish an assessment. Students can only see papers after you publish them." published={examPublished} onPublish={() => setExamPublished(true)} fields={["Paper title", "Subject", "Start date and time", "Duration"]} />}{activeSection === "books" && <AdminForm title="Book publishing" description="Add a revision guide to the student book shop when its details are ready." published={bookPublished} onPublish={() => setBookPublished(true)} fields={["Book title", "Author or publisher", "Subject", "Price"]} />}{activeSection === "videos" && <AdminForm title="Video lesson manager" description="Add a lesson link and publish it to the student learning library." published={videoPublished} onPublish={() => setVideoPublished(true)} fields={["Video title", "Video URL", "Subject", "Duration"]} />}</div></section></main>;
}

type StudentProfile = {
  fullName: string;
  email: string;
  educationLevel: string;
  grade: number | null;
  stream: string;
  subjects: string[];
};

type AuthResponseUser = {
  email?: string | null;
  fullName?: string;
  educationLevel?: string | null;
  grade?: number | null;
  stream?: string | null;
  subjects?: string[];
  role?: string;
};

function profileFromUser(user: AuthResponseUser | null): StudentProfile {
  const email = user?.email ?? "";
  const emailName = email.split("@")[0]?.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Student";

  return {
    fullName: user?.fullName?.trim() || emailName,
    email,
    educationLevel: user?.educationLevel || "Not provided",
    grade: typeof user?.grade === "number" ? user.grade : null,
    stream: user?.stream || "Not provided",
    subjects: user?.subjects ?? [],
  };
}

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "ST";
}

function ProfileModal({ profile, onClose, onSignOut }: { profile: StudentProfile; onClose: () => void; onSignOut: () => void }) {
  const academicDetails = [profile.educationLevel, profile.grade ? `Grade ${profile.grade}` : "", profile.stream !== "Not provided" ? profile.stream : "", profile.subjects.length ? profile.subjects.join(", ") : ""].filter(Boolean).join(" · ");

  return <div className="modal-backdrop"><section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="profile-modal-head"><div className="profile-hero"><div className="profile-large-avatar">{getInitials(profile.fullName)}</div><div><span className="eyebrow">STUDENT PROFILE</span><h2 id="profile-title">{profile.fullName}</h2><p>{academicDetails || "Student account"}</p></div></div><button className="close-button" onClick={onClose} aria-label="Close profile">×</button></div><div className="profile-form"><label>Full name<input value={profile.fullName} readOnly /></label><label>Email address<input value={profile.email} readOnly type="email" /></label><div className="profile-two-col"><label>Education level<input value={profile.educationLevel} readOnly /></label><label>Stream<input value={profile.stream} readOnly /></label></div><label>Subjects<input value={profile.subjects.length ? profile.subjects.join(", ") : "Not provided"} readOnly /></label></div><div className="profile-modal-foot"><button className="signout-button" onClick={onSignOut}>Sign out</button><div><button className="secondary-button" onClick={onClose}>Close</button></div></div></section></div>;
}

export default function Home() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [portal, setPortal] = useState<"student" | "admin">("student");
  const [selectedVideo, setSelectedVideo] = useState<VideoCard | null>(null);
  const [publishedExam] = useState<PublishedExam | null>(null);
  const [contentVideos, setContentVideos] = useState<VideoCard[]>([]);
  const [contentBooks, setContentBooks] = useState<BookCard[]>([]);
  const [contentExams, setContentExams] = useState<PublishedExam[]>([]);
  const [contentError, setContentError] = useState("");
  const [landingStats, setLandingStats] = useState<LandingStats | null>(null);
  const [landingStatsError, setLandingStatsError] = useState(false);
  const [allWrittenPapers, setAllWrittenPapers] = useState<PublishedWrittenPaper[]>([]);
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [showAuthPanel, setShowAuthPanel] = useState(false);
  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<StudentProfile>({ fullName: "Student", email: "", educationLevel: "Not provided", grade: null, stream: "Not provided", subjects: [] });
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [userRole, setUserRole] = useState<"student" | "admin" | null>(null);
  const [activeNav, setActiveNav] = useState("Overview");
  const [examOpen, setExamOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [attemptDeadline, setAttemptDeadline] = useState<number | null>(null);
  const [scheduleNow, setScheduleNow] = useState(() => Date.now());
  const [profileOpen, setProfileOpen] = useState(false);
  const [question, setQuestion] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const autoSubmitStarted = useRef(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answerSheetFile, setAnswerSheetFile] = useState<File | null>(null);
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  const [progressRefreshKey, setProgressRefreshKey] = useState(0);
  const [progressSummary, setProgressSummary] = useState<StudentProgressSummary | null>(null);
  const [progressSummaryError, setProgressSummaryError] = useState("");
  const [examError, setExamError] = useState("");
  const submitExamRef = useRef<() => Promise<void>>(async () => undefined);
  const [educationLevel, setEducationLevel] = useState("");
  const [studentGrade, setStudentGrade] = useState("");
  const [stream, setStream] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subjectError, setSubjectError] = useState(false);
  const [basket, setBasket] = useState<string[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [compactLayout, setCompactLayout] = useState(false);
  const [language, setLanguage] = useState("English");
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<{ from: "assistant" | "user"; text: string }[]>([]);
  const [assistantInput, setAssistantInput] = useState("");
  const text = translations[language as keyof typeof translations];
  const availableExams = useMemo(
    () => (publishedExam ? [publishedExam, ...contentExams] : contentExams)
      .filter((exam) => Date.parse(exam.endsAt) > scheduleNow),
    [contentExams, publishedExam, scheduleNow],
  );
  const activeExam = publishedExam ?? (activeExamId
    ? availableExams.find((exam) => exam.id === activeExamId) ?? null
    : availableExams[0] ?? null);
  const questions = activeExam?.questions ?? [];
  const academicProfile = { educationLevel: profile.educationLevel === "Not provided" ? null : profile.educationLevel, grade: profile.grade, stream: profile.stream === "Not provided" ? null : profile.stream };
  const exams = userRole === "student" ? availableExams.filter((exam) => matchesAcademicAudience(academicProfile, exam)) : availableExams;
  const writtenPapers = userRole === "student" ? allWrittenPapers.filter((paper) => matchesAcademicAudience(academicProfile, paper)) : allWrittenPapers;
  const academicProfileComplete = isAcademicProfileComplete(academicProfile);
  const quizExams = exams.filter((exam) => exam.isQuiz);
  const scheduledExams = exams.filter((exam) => !exam.isQuiz);
  const leadingRecommendation = progressSummary?.recommendations[0] ?? null;
  const learningCategories: LearningShowcaseCard[] = [
    { title: "Exams", description: "Prepare for your next assessment with practice papers.", summary: `${scheduledExams.length + writtenPapers.length} available`, image: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&h=500&fit=crop", icon: "▣", destination: "Examinations", actionLabel: "Explore exams" },
    { title: "Quiz", description: "Check your understanding with quick quizzes.", summary: `${quizExams.length} available`, image: "https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=800&h=500&fit=crop", icon: "✓", destination: "Examinations", actionLabel: "Explore quizzes" },
    { title: "Videos", description: "Watch lessons and revise at your own pace.", summary: `${contentVideos.length} lessons`, image: "https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=800&h=500&fit=crop", icon: "▶", destination: "My learning", actionLabel: "Explore videos" },
    { title: "Books", description: "Find revision guides and resources for your subjects.", summary: `${contentBooks.length} resources`, image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&h=500&fit=crop", icon: "▤", destination: "Book shop", actionLabel: "Browse books" },
    { title: "Classes", description: "Live and guided learning sessions.", summary: "Coming soon", image: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800&h=500&fit=crop", icon: "⌂", destination: null, actionLabel: "Coming soon" },
  ];
  const calendarDays = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const calendarStartOffset = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
  const languageOptions = ["English", "සිංහල", "தமிழ்"];
  const currentPortal = userRole === "admin" ? "admin" : "student";
  const cycleLanguage = () => setLanguage((current) => languageOptions[(languageOptions.indexOf(current) + 1) % languageOptions.length]);

  const submitExam = useCallback(async () => {
    if (!activeExam) return;
    setExamError("");
    try {
      const submittedAnswers = { answers: Object.entries(answers).map(([questionId, selectedAnswer]) => ({ questionId, answer: selectedAnswer })) };
      const form = new FormData();
      form.set("answers", JSON.stringify(submittedAnswers));
      if (answerSheetFile) form.set("answerSheet", answerSheetFile);
      const response = await fetch(`/api/exams/${activeExam.id}/submit`, answerSheetFile
        ? { method: "POST", body: form }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submittedAnswers) });
      const payload = await response.json() as ExamResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The exam could not be submitted.");
      setExamResult(payload);
      setContentExams((current) => current.map((exam) => exam.id === activeExam.id ? { ...exam, studentAttemptStatus: "SUBMITTED" } : exam));
      setAnswerSheetFile(null);
      setProgressRefreshKey((current) => current + 1);
      setExamOpen(false);
    } catch (submitError) {
      setExamError(submitError instanceof Error ? submitError.message : "The exam could not be submitted.");
    }
  }, [activeExam, answers, answerSheetFile]);

  useEffect(() => {
    submitExamRef.current = submitExam;
  }, [submitExam]);

  const openExam = async (exam: PublishedExam) => {
    const resumingAttempt = activeExamId === exam.id;
    setActiveExamId(exam.id);
    if (!resumingAttempt) setQuestion(0);
    setExamResult(null);
    setExamError("");
    setAnswerSheetFile(null);
    setAttemptDeadline(null);
    autoSubmitStarted.current = false;
    try {
      const response = await fetch(`/api/exams/${exam.id}/attempt`, { method: "POST" });
      const payload = await response.json() as { expiresAt?: string; remainingSeconds?: number; startsAt?: string; error?: string };
      if (!response.ok || !payload.expiresAt) {
        const startTime = payload.startsAt ? new Date(payload.startsAt) : null;
        throw new Error(startTime && Number.isFinite(startTime.getTime())
          ? `This exam starts at ${startTime.toLocaleString()}.`
          : payload.error ?? "This exam could not be started.");
      }
      const deadline = Date.parse(payload.expiresAt);
      if (!Number.isFinite(deadline)) throw new Error("The exam returned an invalid time limit.");
      setContentExams((current) => current.map((contentExam) => contentExam.id === exam.id ? { ...contentExam, studentAttemptStatus: "IN_PROGRESS" } : contentExam));
      setAttemptDeadline(deadline);
      setSeconds(payload.remainingSeconds ?? Math.max(0, Math.round(exam.durationMins * 60)));
      setExamOpen(true);
    } catch (startError) {
      window.alert(startError instanceof Error ? startError.message : "This exam could not be started.");
    }
  };

  const updateProfileFromUser = (user: AuthResponseUser | null) => {
    const nextProfile = profileFromUser(user);
    setProfile(nextProfile);
    setFullName(nextProfile.fullName);
    setEmail(nextProfile.email);
    setEducationLevel(nextProfile.educationLevel === "Not provided" ? "" : nextProfile.educationLevel);
    setStudentGrade(nextProfile.grade ? String(nextProfile.grade) : "");
    setStream(nextProfile.stream === "Not provided" ? "" : nextProfile.stream);
    setSubjects(nextProfile.subjects);
    setAssistantMessages([{ from: "assistant", text: `Hi ${nextProfile.fullName}. I can help with your exams, learning plan, books, or account settings.` }]);
  };

  const handleSignOut = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    setAuthenticated(false);
    setUserRole(null);
    setProgressSummary(null);
    setProgressSummaryError("");
    setAuthError("");
    setAuthMessage("");
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");

    if (authView === "signup" && educationLevel === "GCE Advanced Level (A/L)" && subjects.length === 0) {
      setSubjectError(true);
      return;
    }
    if (authView === "signup" && (!academicLevel(educationLevel) || !studentGrade)) {
      setAuthError("Choose your education level and grade before creating your account.");
      return;
    }

    setAuthLoading(true);

    try {
      if (authView === "signup") {
        const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "signup", email, password, fullName, mobileNumber, educationLevel, grade: Number(studentGrade), stream, subjects }) });
        const payload = (await response.json()) as { error?: string; user?: AuthResponseUser };
        if (!response.ok || !payload.user) throw new Error(payload.error ?? "Unable to create the account.");
        setProgressSummary(null);
        setProgressSummaryError("");
        setAuthenticated(true);
        setUserRole("student");
        updateProfileFromUser(payload.user);
        setAuthMessage("Registration successful. You are now signed in.");
        return;
      }

      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "signin", email, password }) });
      const payload = (await response.json()) as { error?: string; user?: AuthResponseUser };
      if (!response.ok || !payload.user) throw new Error(payload.error ?? "Authentication failed.");
      const sessionRole = payload.user.role === "admin" ? "admin" : "student";
      updateProfileFromUser(payload.user);
      setProgressSummary(null);
      setProgressSummaryError("");
      setAuthenticated(true);
      setUserRole(sessionRole);
      setAuthMessage("Signed in successfully.");
      if (sessionRole === "admin") router.replace("/admin");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setAuthError("");
    setAuthMessage("");
    setAuthLoading(true);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "google", credential }) });
      const payload = (await response.json()) as { error?: string; user?: AuthResponseUser };
      if (!response.ok || !payload.user) throw new Error(payload.error ?? "Google sign-in failed.");
      const sessionRole = payload.user.role === "admin" ? "admin" : "student";
      updateProfileFromUser(payload.user);
      setProgressSummary(null);
      setProgressSummaryError("");
      setAuthenticated(true);
      setUserRole(sessionRole);
      setAuthMessage("Signed in successfully with Google.");
      if (sessionRole === "admin") router.replace("/admin");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Google sign-in failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const googleCredentialHandler = useRef(handleGoogleCredential);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleInitialized = useRef(false);
  useEffect(() => {
    googleCredentialHandler.current = handleGoogleCredential;
  });

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const button = googleButtonRef.current;
    if (authenticated || !showAuthPanel || portal !== "student" || !clientId || !button) return;

    const renderButton = () => {
      if (!window.google || !button.isConnected) return;
      if (!googleInitialized.current) {
        window.google.accounts.id.initialize({ client_id: clientId, callback: ({ credential }) => googleCredentialHandler.current(credential) });
        googleInitialized.current = true;
      }
      button.replaceChildren();
      window.google.accounts.id.renderButton(button, { theme: "outline", size: "large", width: Math.min(350, Math.max(200, button.clientWidth)) });
    };
    const scriptUrl = "https://accounts.google.com/gsi/client";
    let script = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
    if (window.google) {
      renderButton();
      return;
    }

    const onLoad = () => renderButton();
    const onError = () => setAuthError("Google sign-in could not load. Please try again or use your email and password.");
    if (!script) {
      script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      document.head.append(script);
    }
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    return () => {
      script?.removeEventListener("load", onLoad);
      script?.removeEventListener("error", onError);
    };
  }, [authenticated, authView, portal, showAuthPanel]);

  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" }).then((response) => response.json()).then((payload: { user?: AuthResponseUser | null }) => {
      setAuthenticated(Boolean(payload.user));
      setUserRole(payload.user?.role === "admin" ? "admin" : payload.user ? "student" : null);
      if (payload.user) {
        updateProfileFromUser(payload.user);
        if (payload.user.role === "admin") router.replace("/admin");
      }
    }).catch(() => undefined);
  }, [router]);

  useEffect(() => {
    let current = true;
    fetch("/api/stats", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Landing page statistics could not be loaded.");
        const payload: unknown = await response.json();
        if (!isLandingStats(payload)) throw new Error("Landing page statistics response was invalid.");
        if (current) {
          setLandingStats(payload);
          setLandingStatsError(false);
        }
      })
      .catch((error: unknown) => {
        console.error("Landing page statistics could not be loaded:", error);
        if (current) setLandingStatsError(true);
      });

    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!authenticated || userRole !== "student") return;

    let current = true;
    fetch("/api/student/progress", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as StudentProgressSummary & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Your progress summary could not be loaded.");
        if (current) {
          setProgressSummary(payload);
          setProgressSummaryError("");
        }
      })
      .catch((error: unknown) => {
        console.error("Student progress summary could not be loaded:", error);
        if (current) setProgressSummaryError("Your progress summary could not be loaded. Please open Progress to try again.");
      });

    return () => { current = false; };
  }, [authenticated, userRole, progressRefreshKey]);

  useEffect(() => {
    fetch("/api/content").then((response) => {
      if (!response.ok) throw new Error("Published content could not be loaded.");
      return response.json();
    }).then((payload: { books?: { id: string; title: string; author: string; subject: string; level: string; price: number; coverColor: string; imageUrl: string | null }[]; videos?: { id: string; title: string; subject: string; level: string; duration: string; thumbnail: string | null; videoUrl: string }[]; exams?: ContentExam[]; writtenPapers?: PublishedWrittenPaper[] }) => {
      const bookPlaceholders = [
        "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&h=600&fit=crop",
        "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=400&h=600&fit=crop",
        "https://images.unsplash.com/photo-1541963463532-d68292c34b19?w=400&h=600&fit=crop",
        "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400&h=600&fit=crop",
        "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=600&fit=crop",
        "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400&h=600&fit=crop",
      ];
      const videoPlaceholders = [
        "https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=640&h=360&fit=crop",
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=640&h=360&fit=crop",
        "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=640&h=360&fit=crop",
        "https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=640&h=360&fit=crop",
        "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=640&h=360&fit=crop",
        "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=640&h=360&fit=crop",
      ];
      setContentBooks((payload.books ?? []).map((book, idx) => ({ ...book, price: `LKR ${book.price.toLocaleString("en-LK")}`, color: book.coverColor, imageUrl: book.imageUrl && book.imageUrl.trim() ? book.imageUrl : bookPlaceholders[idx % bookPlaceholders.length] })));
      setContentVideos((payload.videos ?? []).map((video, idx) => ({ ...video, color: "#d6e8e1", image: video.thumbnail && video.thumbnail.trim() ? video.thumbnail : videoPlaceholders[idx % videoPlaceholders.length] })));
      setContentExams((payload.exams ?? []).map(mapContentExam));
      setAllWrittenPapers(payload.writtenPapers ?? []);
      setContentError("");
    }).catch((loadError: unknown) => {
      console.error("Published student content could not be loaded:", loadError);
      setContentError("Published content could not be loaded. Refresh the page to try again.");
    });
  }, []);

  useEffect(() => {
    if (activeNav !== "Examinations") return;
    let current = true;
    fetch("/api/content", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error("Published exams could not be refreshed.");
      return response.json() as Promise<{ exams?: ContentExam[] }>;
    }).then((payload) => {
      if (!current) return;
      setContentExams((payload.exams ?? []).map(mapContentExam));
      setContentError("");
    }).catch((loadError: unknown) => {
      if (!current) return;
      console.error("Published exams could not be refreshed:", loadError);
      setContentError("Published exams could not be refreshed. Try again in a moment.");
    });
    return () => { current = false; };
  }, [activeNav]);

  useEffect(() => {
    const now = Date.now();
    const nextTransition = contentExams
      .flatMap((exam) => [Date.parse(exam.startsAt), Date.parse(exam.endsAt)])
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp > now)
      .sort((left, right) => left - right)[0];
    if (nextTransition === undefined) return;
    const timeout = window.setTimeout(
      () => setScheduleNow(Date.now()),
      Math.min(nextTransition - now, 2_147_000_000),
    );
    return () => window.clearTimeout(timeout);
  }, [contentExams, scheduleNow]);

  useEffect(() => {
    if (attemptDeadline === null || autoSubmitStarted.current) return;
    const updateRemainingTime = () => {
      const remaining = Math.max(0, Math.ceil((attemptDeadline - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining <= 1 && !autoSubmitStarted.current) {
        autoSubmitStarted.current = true;
        void submitExamRef.current();
      }
    };
    updateRemainingTime();
    const timer = window.setInterval(updateRemainingTime, 250);
    return () => window.clearInterval(timer);
  }, [attemptDeadline]);

  useEffect(() => {
    const handleProfileTrigger = (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest("button");
      if (button && (button.textContent?.includes("View profile") || button.textContent?.trim() === "NS")) setProfileOpen(true);
    };
    document.addEventListener("click", handleProfileTrigger);
    return () => document.removeEventListener("click", handleProfileTrigger);
  }, []);

  useEffect(() => {
    const root = document.querySelector("main");
    if (!root) return;
    const languageIndex = language === "English" ? 0 : language === "සිංහල" ? 1 : 2;
    const replacements = new Map<string, string>();
    pageTranslationRows.forEach((row) => row.forEach((value, index) => { replacements.set(value, row[languageIndex]); if (index === 0) replacements.set(value.toUpperCase(), row[languageIndex]); }));
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node = walker.nextNode();
    while (node) { textNodes.push(node as Text); node = walker.nextNode(); }
    textNodes.forEach((textNode) => {
      const trimmed = textNode.nodeValue?.trim();
      if (!trimmed || !replacements.has(trimmed)) return;
      const translated = replacements.get(trimmed);
      if (translated) textNode.nodeValue = textNode.nodeValue?.replace(trimmed, translated) ?? translated;
    });
  }, [language, activeNav, authenticated, authView, assistantOpen]);

  const formattedTime = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const availableSubjects = streamSubjects[stream] ?? [];
  const toggleSubject = (subject: string) => {
    setSubjects((current) => current.includes(subject) ? current.filter((item) => item !== subject) : [...current, subject]);
    setSubjectError(false);
  };
  const askAssistant = (topic: keyof typeof assistantReplies, label: string) => {
    setAssistantMessages((messages) => [...messages, { from: "user", text: label }, { from: "assistant", text: assistantReplies[topic] }]);
  };
  const submitAssistantMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = assistantInput.trim();
    if (!message) return;
    const lowerMessage = message.toLowerCase();
    const topic = lowerMessage.includes("exam") ? "exams" : lowerMessage.includes("book") ? "books" : lowerMessage.includes("setting") || lowerMessage.includes("account") ? "account" : "learning";
    setAssistantMessages((messages) => [...messages, { from: "user", text: message }, { from: "assistant", text: assistantReplies[topic] }]);
    setAssistantInput("");
  };

if (!authenticated) {
    return (
      <main className="landing-page">
        <nav className="landing-nav" role="navigation" aria-label="Main navigation">
          <div className="landing-nav-container">
            <div className="landing-nav-brand"><span className="brand-mark">e</span><span>E-mind</span></div>
            <div className="landing-nav-links">
              <a href="#hero-title" className="landing-nav-link" onClick={(e) => { e.preventDefault(); document.getElementById('hero-title')?.scrollIntoView({ behavior: 'smooth' }); }}>Home</a>
              <a href="#features-title" className="landing-nav-link" onClick={(e) => { e.preventDefault(); document.getElementById('features-title')?.scrollIntoView({ behavior: 'smooth' }); }}>Resources</a>
              <a href="mailto:edusmart029@gmail.com" className="landing-nav-link">Contact Us</a>
            </div>
            <div className="landing-nav-actions">
              <button className="landing-btn-secondary" onClick={() => { setPortal("student"); setAuthView("login"); setShowAuthPanel(true); }}>Login</button>
              <button className="landing-btn-primary" onClick={() => { setPortal("student"); setAuthView("signup"); setShowAuthPanel(true); }}>Register</button>
            </div>
          </div>
        </nav>

        <section className="landing-section landing-hero-section" aria-labelledby="hero-title">
          <div className="landing-container">
            <div className="landing-hero-grid">
              <div className="landing-hero-content">
                <div className="landing-hero-badge animate-fade-in-up">🚀 New: AI-powered learning insights</div>
                <h1 id="hero-title" className="landing-hero-title animate-fade-in-up delay-100">Your next breakthrough starts here.</h1>
                <p className="landing-hero-subtitle animate-fade-in-up delay-200">One focused space for Sri Lankan students to learn with purpose, practise with confidence, and see their progress clearly.</p>
                <div className="landing-hero-buttons animate-fade-in-up delay-300">
                  <button className="landing-btn-primary" onClick={() => { setPortal("student"); setAuthView("signup"); setShowAuthPanel(true); }}>Get Started Free</button>
                  <button className="landing-btn-secondary" onClick={() => { setPortal("student"); setAuthView("login"); setShowAuthPanel(true); }}>Login to your space</button>
                </div>
                <div className="landing-stats animate-fade-in-up delay-400">
                  <div className="landing-stat-item"><div className="landing-stat-value">{landingStats ? landingStats.activeStudents.toLocaleString() : landingStatsError ? "—" : "…"}</div><div className="landing-stat-label">Students active in last 30 days</div></div>
                  <div className="landing-stat-item"><div className="landing-stat-value">{landingStats ? landingStats.practiceExams.toLocaleString() : landingStatsError ? "—" : "…"}</div><div className="landing-stat-label">Published practice exams</div></div>
                </div>
                {landingStatsError && <p className="landing-stats-error" role="status">Live statistics are temporarily unavailable.</p>}
                <div className="landing-trust-badges animate-fade-in-up delay-500">
                  <span>Trusted by schools across Colombo, Kandy, Galle & Jaffna</span>
                  <div className="landing-trust-logos">
                    <span className="trust-logo">🏫</span>
                    <span className="trust-logo">📚</span>
                    <span className="trust-logo">🎓</span>
                    <span className="trust-logo">🏆</span>
                  </div>
                </div>
              </div>
              <div className="landing-hero-visual animate-fade-in-right delay-200">
                <div className="hero-illustration-container">
                  <Image
                    src="https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=800&h=600&fit=crop" 
                    width={800}
                    height={600}
                    sizes="(max-width: 768px) 100vw, 580px"
                    alt="Students learning with E-mind"
                    className="hero-illustration"
                    loading="eager"
                  />
                  <div className="hero-floating-cards">
                    <div className="float-card float-card-1">
                      <span className="float-icon">📈</span>
                      <span>+23% avg improvement</span>
                    </div>
                    <div className="float-card float-card-2">
                      <span className="float-icon">⚡</span>
                      <span>AI-powered insights</span>
                    </div>
                    <div className="float-card float-card-3">
                      <span className="float-icon">🎯</span>
                      <span>Personalized paths</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="features-title">
          <div className="landing-container">
            <div className="reveal" style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto 48px' }}>
              <span className="landing-hero-badge" style={{ background: 'var(--soft-green)', color: 'var(--green)' }}>Our Features</span>
              <h2 id="features-title" style={{ font: '800 clamp(32px, 4vw, 48px) Manrope, sans-serif', marginTop: '16px', marginBottom: '12px', color: 'var(--ink)' }}>Everything you need to excel</h2>
              <p style={{ fontSize: '18px', color: 'var(--muted)', lineHeight: 1.7 }}>Personalized learning paths, real exam practice, and AI-powered insights — all in one place.</p>
            </div>
            <div className="landing-features-grid">
              <article className="landing-feature-card-full reveal animate-fade-in-up delay-100">
                <div className="feature-visual" style={{ background: 'linear-gradient(135deg, var(--soft-green) 0%, #d4f4e7 100%)' }}>
                  <Image
                    src="https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=500&h=350&fit=crop" 
                    width={500}
                    height={350}
                    sizes="(max-width: 768px) 100vw, 500px"
                    alt="Personalized learning path dashboard" 
                    className="feature-image"
                    loading="lazy"
                  />
                  <div className="feature-badge">🎯 Personalized</div>
                </div>
                <div className="feature-content">
                  <div className="feature-icon" style={{ background: 'var(--soft-green)', color: 'var(--green)' }}>📚</div>
                  <h3 className="landing-feature-title">Personalized Learning Paths</h3>
                  <p className="landing-feature-desc">AI-driven recommendations adapt to your strengths, weaknesses, and exam schedule for maximum efficiency.</p>
                  <ul className="feature-highlights">
                    <li>📋 Adaptive curriculum</li>
                    <li>📅 Smart scheduling</li>
                    <li>🎯 Weakness targeting</li>
                  </ul>
                </div>
              </article>
              <article className="landing-feature-card-full reveal animate-fade-in-up delay-200">
                <div className="feature-visual" style={{ background: 'linear-gradient(135deg, #fff3e6 0%, #ffe8cc 100%)' }}>
                  <Image
                    src="https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=500&h=350&fit=crop" 
                    width={500}
                    height={350}
                    sizes="(max-width: 768px) 100vw, 500px"
                    alt="Real exam practice interface" 
                    className="feature-image"
                    loading="lazy"
                  />
                  <div className="feature-badge">📝 Practice</div>
                </div>
                <div className="feature-content">
                  <div className="feature-icon" style={{ background: '#fff3e6', color: 'var(--gold)' }}>📝</div>
                  <h3 className="landing-feature-title">Real Exam Practice</h3>
                  <p className="landing-feature-desc">Practice with authentic past papers, timed mock exams, and instant AI grading with detailed explanations.</p>
                  <ul className="feature-highlights">
                    <li>📄 Past paper library</li>
                    <li>⏱️ Timed mock exams</li>
                    <li>🤖 AI auto-grading</li>
                  </ul>
                </div>
              </article>
              <article className="landing-feature-card-full reveal animate-fade-in-up delay-300">
                <div className="feature-visual" style={{ background: 'linear-gradient(135deg, #e0d4f7 0%, #d4c4f0 100%)' }}>
                  <Image
                    src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=500&h=350&fit=crop" 
                    width={500}
                    height={350}
                    sizes="(max-width: 768px) 100vw, 500px"
                    alt="Progress analytics dashboard" 
                    className="feature-image"
                    loading="lazy"
                  />
                  <div className="feature-badge">📊 Analytics</div>
                </div>
                <div className="feature-content">
                  <div className="feature-icon" style={{ background: '#e0d4f7', color: '#8d6799' }}>📊</div>
                  <h3 className="landing-feature-title">Progress Analytics</h3>
                  <p className="landing-feature-desc">Track your improvement with detailed subject breakdowns, streak tracking, and predictive scoring.</p>
                  <ul className="feature-highlights">
                    <li>📈 Subject breakdowns</li>
                    <li>🔥 Streak tracking</li>
                    <li>🔮 Predictive scoring</li>
                  </ul>
                </div>
              </article>
              <article className="landing-feature-card-full reveal animate-fade-in-up delay-400">
                <div className="feature-visual" style={{ background: 'linear-gradient(135deg, #d4f4e7 0%, #b8e8d0 100%)' }}>
                  <Image
                    src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500&h=350&fit=crop" 
                    width={500}
                    height={350}
                    sizes="(max-width: 768px) 100vw, 500px"
                    alt="AI study assistant chat interface" 
                    className="feature-image"
                    loading="lazy"
                  />
                  <div className="feature-badge">🤖 AI Assistant</div>
                </div>
                <div className="feature-content">
                  <div className="feature-icon" style={{ background: '#d4f4e7', color: '#2a8c73' }}>🤖</div>
                  <h3 className="landing-feature-title">AI Study Assistant</h3>
                  <p className="landing-feature-desc">Get instant help with concepts, generate practice questions, and receive personalized study plans.</p>
                  <ul className="feature-highlights">
                    <li>💬 Instant explanations</li>
                    <li>❓ Practice generation</li>
                    <li>📋 Study planning</li>
                  </ul>
                </div>
              </article>
              <article className="landing-feature-card-full reveal animate-fade-in-up delay-500">
                <div className="feature-visual" style={{ background: 'linear-gradient(135deg, #fce4e4 0%, #f8d0d0 100%)' }}>
                  <Image
                    src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=500&h=350&fit=crop" 
                    width={500}
                    height={350}
                    sizes="(max-width: 768px) 100vw, 500px"
                    alt="Gamified learning progress" 
                    className="feature-image"
                    loading="lazy"
                  />
                  <div className="feature-badge">🏆 Gamified</div>
                </div>
                <div className="feature-content">
                  <div className="feature-icon" style={{ background: '#fce4e4', color: '#c88624' }}>🏆</div>
                  <h3 className="landing-feature-title">Gamified Progress</h3>
                  <p className="landing-feature-desc">Earn badges, maintain streaks, and compete on leaderboards to stay motivated throughout your journey.</p>
                  <ul className="feature-highlights">
                    <li>🏅 Achievement badges</li>
                    <li>🔥 Daily streaks</li>
                    <li>🏆 Leaderboards</li>
                  </ul>
                </div>
              </article>
              <article className="landing-feature-card-full reveal animate-fade-in-up delay-600">
                <div className="feature-visual" style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)' }}>
                  <Image
                    src="https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=500&h=350&fit=crop" 
                    width={500}
                    height={350}
                    sizes="(max-width: 768px) 100vw, 500px"
                    alt="Mobile learning experience" 
                    className="feature-image"
                    loading="lazy"
                  />
                  <div className="feature-badge">📱 Mobile</div>
                </div>
                <div className="feature-content">
                  <div className="feature-icon" style={{ background: '#dbeafe', color: '#3b82f6' }}>📱</div>
                  <h3 className="landing-feature-title">Learn Anywhere</h3>
                  <p className="landing-feature-desc">Seamless experience across desktop, tablet, and mobile with offline sync for uninterrupted learning.</p>
                  <ul className="feature-highlights">
                    <li>📱 Mobile optimized</li>
                    <li>💾 Offline sync</li>
                    <li>☁️ Cloud backup</li>
                  </ul>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="landing-section" style={{ background: 'linear-gradient(180deg, var(--paper) 0%, #f8faf8 100%)' }} aria-labelledby="demo-title">
          <div className="landing-container">
            <div className="reveal" style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto 48px' }}>
              <span className="landing-hero-badge" style={{ background: '#dbeafe', color: '#3b82f6' }}>Video Demo</span>
              <h2 id="demo-title" style={{ font: '800 clamp(32px, 4vw, 48px) Manrope, sans-serif', marginTop: '16px', marginBottom: '12px', color: 'var(--ink)' }}>See E-mind in action</h2>
              <p style={{ fontSize: '18px', color: 'var(--muted)', lineHeight: 1.7 }}>Watch how students across Sri Lanka are transforming their learning experience.</p>
            </div>
            <div className="landing-video-demo reveal animate-fade-in-up">
              <div className="video-player-wrapper">
                <div className="video-thumbnail" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=1200&h=675&fit=crop)' }}>
                  <button className="video-play-btn" aria-label="Play demo video">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="32" fill="var(--green)"/><path d="M26 22l16 10-16 10z" fill="white"/></svg>
                  </button>
                  <div className="video-duration">3:42</div>
                </div>
                <div className="video-info">
                  <h3>E-mind Platform Walkthrough</h3>
                  <p>Complete platform tour showing personalized learning, AI assistant, exam practice, and progress tracking.</p>
                  <div className="video-stats">
                    <span>👁️ 125K+ views</span>
                    <span>⭐ 4.9/5 rating</span>
                    <span>🇱🇰 Sri Lanka</span>
                  </div>
                </div>
              </div>
              <div className="video-features">
                <div className="video-feature-item">
                  <span className="video-feature-icon">🎬</span>
                  <span>HD walkthrough</span>
                </div>
                <div className="video-feature-item">
                  <span className="video-feature-icon">🇱🇰</span>
                  <span>Sinhala/Tamil subtitles</span>
                </div>
                <div className="video-feature-item">
                  <span className="video-feature-icon">📱</span>
                  <span>Mobile friendly</span>
                </div>
                <div className="video-feature-item">
                  <span className="video-feature-icon">🔄</span>
                  <span>Always updated</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section" style={{ background: 'linear-gradient(180deg, var(--paper) 0%, #f0f7f4 100%)' }} aria-labelledby="how-title">
          <div className="landing-container">
            <div className="reveal" style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto 48px' }}>
              <span className="landing-hero-badge" style={{ background: 'var(--soft-green)', color: 'var(--green)' }}>How It Works</span>
              <h2 id="how-title" style={{ font: '800 clamp(32px, 4vw, 48px) Manrope, sans-serif', marginTop: '16px', marginBottom: '12px', color: 'var(--ink)' }}>Start learning in 3 simple steps</h2>
            </div>
            <div className="landing-grid landing-grid-3" style={{ gap: '32px' }}>
              <div className="landing-card reveal animate-fade-in-up delay-100" style={{ textAlign: 'center', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '-16px', left: '50%', transform: 'translateX(-50%)', width: '32px', height: '32px', borderRadius: '50%', background: 'var(--green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 16px Manrope, sans-serif' }}>1</div>
                <div className="landing-card-icon" style={{ margin: '32px auto 16px', background: 'var(--soft-green)', color: 'var(--green)' }}>✍️</div>
                <h3 className="landing-card-title">Create Your Profile</h3>
                <p className="landing-card-desc">Tell us your grade, stream, and subjects. Our AI builds a personalized learning plan instantly.</p>
              </div>
              <div className="landing-card reveal animate-fade-in-up delay-200" style={{ textAlign: 'center', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '-16px', left: '50%', transform: 'translateX(-50%)', width: '32px', height: '32px', borderRadius: '50%', background: 'var(--green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 16px Manrope, sans-serif' }}>2</div>
                <div className="landing-card-icon" style={{ margin: '32px auto 16px', background: '#fff3e6', color: 'var(--gold)' }}>🎯</div>
                <h3 className="landing-card-title">Practice & Learn</h3>
                <p className="landing-card-desc">Access curated video lessons, practice questions, and full mock exams tailored to your syllabus.</p>
              </div>
              <div className="landing-card reveal animate-fade-in-up delay-300" style={{ textAlign: 'center', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '-16px', left: '50%', transform: 'translateX(-50%)', width: '32px', height: '32px', borderRadius: '50%', background: 'var(--green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 16px Manrope, sans-serif' }}>3</div>
                <div className="landing-card-icon" style={{ margin: '32px auto 16px', background: '#e0d4f7', color: '#8d6799' }}>📈</div>
                <h3 className="landing-card-title">Track & Improve</h3>
                <p className="landing-card-desc">Watch your scores rise with AI-powered insights, weak area detection, and adaptive recommendations.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="testimonials-title">
          <div className="landing-container">
            <div className="reveal" style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto 48px' }}>
              <span className="landing-hero-badge" style={{ background: '#fff3e6', color: 'var(--gold)' }}>Trusted by Students</span>
              <h2 id="testimonials-title" style={{ font: '800 clamp(32px, 4vw, 48px) Manrope, sans-serif', marginTop: '16px', marginBottom: '12px', color: 'var(--ink)' }}>Loved by thousands across Sri Lanka</h2>
            </div>
            <div className="landing-testimonials">
              <article className="landing-testimonial reveal animate-fade-in-up delay-100">
                <div className="landing-testimonial-stars">★★★★★</div>
                <p className="landing-testimonial-text">&ldquo;The AI study assistant helped me understand Physics vectors in days what took months in class. My grade jumped from 68% to 89%!&rdquo;</p>
                <div className="landing-testimonial-author">
                  <div className="landing-testimonial-avatar">NT</div>
                  <div><div className="landing-testimonial-name">Nethmi T.</div><div className="landing-testimonial-role">A/L Physics · Colombo</div></div>
                </div>
              </article>
              <article className="landing-testimonial reveal animate-fade-in-up delay-200">
                <div className="landing-testimonial-stars">★★★★★</div>
                <p className="landing-testimonial-text">&ldquo;The personalized learning path saved me so much time. I only studied what I actually needed for my O/L exams. Highly recommend!&rdquo;</p>
                <div className="landing-testimonial-author">
                  <div className="landing-testimonial-avatar">KP</div>
                  <div><div className="landing-testimonial-name">Kasun P.</div><div className="landing-testimonial-role">O/L Commerce · Kandy</div></div>
                </div>
              </article>
              <article className="landing-testimonial reveal animate-fade-in-up delay-300">
                <div className="landing-testimonial-stars">★★★★★</div>
                <p className="landing-testimonial-text">&ldquo;As a teacher, I recommend E-mind to all my students. The progress tracking and AI insights make my job so much easier.&rdquo;</p>
                <div className="landing-testimonial-author">
                  <div className="landing-testimonial-avatar">RS</div>
                  <div><div className="landing-testimonial-name">Mrs. R. Silva</div><div className="landing-testimonial-role">A/L Teacher · Galle</div></div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="cta-title">
          <div className="landing-container">
            <div className="landing-cta-section reveal animate-fade-in-up">
              <h2 id="cta-title" className="landing-cta-title">Ready to accelerate your learning?</h2>
              <p className="landing-cta-subtitle">Join 15,000+ Sri Lankan students already using E-mind. Start free today.</p>
              <div className="landing-cta-buttons">
                <button className="landing-cta-btn-primary" onClick={() => { setPortal("student"); setAuthView("signup"); setShowAuthPanel(true); }}>Create Free Account</button>
                <button className="landing-cta-btn-secondary" onClick={() => { setPortal("student"); setAuthView("login"); setShowAuthPanel(true); }}>Login to Continue</button>
              </div>
            </div>
          </div>
        </section>

        <footer className="landing-footer" role="contentinfo">
          <div className="landing-container">
            <div className="landing-nav-brand" style={{ justifyContent: 'center', marginBottom: '16px' }}><span className="brand-mark">e</span><span>E-mind</span></div>
            <div className="landing-footer-links">
              <a href="#" className="landing-footer-link">About Us</a>
              <a href="#" className="landing-footer-link">Privacy Policy</a>
              <a href="#" className="landing-footer-link">Terms of Service</a>
              <a href="mailto:edusmart029@gmail.com" className="landing-footer-link">Contact</a>
            </div>
            <p>© 2024 E-mind Sri Lanka. All rights reserved.</p>
            <p style={{ marginTop: '8px', fontSize: '12px' }}>E-mind Sri Lanka · English · Sinhala · Tamil</p>
          </div>
        </footer>

        {showAuthPanel && (
          <div className="auth-modal-overlay" onClick={() => setShowAuthPanel(false)}>
            <section className="auth-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
              <button className="auth-modal-close" onClick={() => setShowAuthPanel(false)} aria-label="Close">×</button>
              <div className="auth-card">
                <div className="auth-card-heading">
                  <p className="eyebrow">WELCOME BACK</p>
                  <h2 id="auth-modal-title">{authView === "login" ? "Sign in to your space" : "Create your student space"}</h2>
                  <p>{portal === "student" ? "Continue your learning journey." : "Manage learning and examinations securely."}</p>
                </div>
                <div className="portal-switch" role="tablist" aria-label="Choose portal">
                  <button className={portal === "student" ? "selected" : ""} onClick={() => { setPortal("student"); setAuthView("login"); setAuthError(""); setAuthMessage(""); }} role="tab" aria-selected={portal === "student"}>Student portal</button>
                  <button className={portal === "admin" ? "selected" : ""} onClick={() => { setPortal("admin"); setAuthView("login"); setAuthError(""); setAuthMessage(""); }} role="tab" aria-selected={portal === "admin"}>Admin portal</button>
                </div>
                <form className="auth-form" onSubmit={handleAuthSubmit}>
                  {authView === "signup" && <label>Full name<input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="e.g. Nethmi Silva" required /></label>}
                  {authView === "signup" && <label>Mobile number<input type="tel" value={mobileNumber} onChange={(event) => setMobileNumber(event.target.value)} placeholder="Enter your mobile number" autoComplete="tel" required /></label>}
                  <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={portal === "admin" ? "admin@school.lk" : "you@example.com"} required /></label>
                  <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" minLength={8} required /></label>
                  {authView === "signup" && <label>Education level<select value={educationLevel} onChange={(event) => { setEducationLevel(event.target.value); setStudentGrade(""); setStream(""); setSubjects([]); setSubjectError(false); }} required><option value="" disabled>Select your level</option><option>Grade 6–11</option><option>GCE Ordinary Level (O/L)</option><option>GCE Advanced Level (A/L)</option></select></label>}
                  {authView === "signup" && academicLevel(educationLevel) && <label>Current grade<select value={studentGrade} onChange={(event) => setStudentGrade(event.target.value)} required><option value="" disabled>Select your grade</option>{gradesForEducationLevel(educationLevel).map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label>}
                   {authView === "signup" && educationLevel === "GCE Advanced Level (A/L)" && (
                     <div className="academic-details">
                       <label>
                         Stream
                         <select
                           value={stream}
                           onChange={(event) => {
                             setStream(event.target.value);
                             setSubjects([]);
                             setSubjectError(false);
                           }}
                           required
                         >
                           <option value="" disabled>Select your stream</option>
                           {Object.keys(streamSubjects).map((subjectStream) => <option key={subjectStream}>{subjectStream}</option>)}
                         </select>
                       </label>
                       {availableSubjects.length > 0 && (
                         <fieldset aria-invalid={subjectError}>
                           <legend>Choose your subjects</legend>
                           {availableSubjects.map((subject) => (
                             <label key={subject}>
                               <input
                                 type="checkbox"
                                 checked={subjects.includes(subject)}
                                 onChange={() => toggleSubject(subject)}
                               />
                               {subject}
                             </label>
                           ))}
                         </fieldset>
                       )}
                       {subjectError && <p role="alert" style={{ margin: 0, color: "#b42318", fontSize: 13 }}>Choose at least one subject for your stream.</p>}
                     </div>
                   )}
                   {portal === "student" && (
                     <div className="google-auth-option">
                       <div className="auth-divider"><span>or continue with</span></div>
                       {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
                         <div ref={googleButtonRef} className="google-signin" />
                       ) : (
                         <p className="google-config-message" role="status">Google sign-in is currently unavailable.</p>
                       )}
                     </div>
                   )}
                   {authError && <p role="alert" style={{ margin: 0, color: "#b42318", fontSize: 13 }}>{authError}</p>}
                   {authMessage && <p role="status" style={{ margin: 0, color: "var(--green)", fontSize: 13 }}>{authMessage}</p>}
                   <div className="auth-form-footer">
                     <button type="submit" className="primary-button" style={{ width: '100%', justifyContent: 'center' }} disabled={authLoading} aria-busy={authLoading}>
                       {authLoading ? (authView === "login" ? "Signing in..." : "Creating account...") : authView === "login" ? "Sign In" : "Create Account"}
                     </button>
                   </div>
                  <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: 'var(--muted)' }}>{authView === "login" ? "Don't have an account? " : "Already have an account? "}<button type="button" onClick={() => setAuthView(authView === "login" ? "signup" : "login")} style={{ color: 'var(--green)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>{authView === "login" ? "Register" : "Login"}</button></p>
                </form>
              </div>
            </section>
          </div>
        )}
      </main>
    );
  }

  if (currentPortal === "admin") return <AdminDashboard onSignOut={handleSignOut} />;

  return (
    <main className="app-shell">
      {selectedVideo && <VideoPlayerModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />}
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">e</span><span>E-mind</span></div>
        <div className="school-label">STUDENT SPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          { ["Overview", "My learning", "Examinations", "Progress", "Book shop"].map((item, index) => (
            <button key={item} className={`nav-item ${activeNav === item ? "active" : ""}`} onClick={() => setActiveNav(item)}>
              <span className="nav-icon">{["⌂", "▣", "◷", "↗", "▤"][index]}</span>{[text.overview, text.learning, text.examinations, text.progress, text.shop][index]}
              {item === "Examinations" && <span className="nav-count">2</span>}
              {item === "Book shop" && basket.length > 0 && <span className="nav-count">{basket.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className={`nav-item ${activeNav === "Settings" ? "active" : ""}`} onClick={() => setActiveNav("Settings")}><span className="nav-icon">⚙</span>{text.settings}</button>
          <button className="language-switch" onClick={cycleLanguage} aria-label="Change language"><span>◉</span> {language} <span className="chevron">⌄</span></button>
          <button className="mini-profile" onClick={() => setProfileOpen(true)}><div className="avatar">{getInitials(profile.fullName)}</div><div><strong>{profile.fullName}</strong><span>{profile.stream !== "Not provided" ? profile.stream : profile.educationLevel}</span></div><span className="more">•••</span></button>
        </div>
      </aside>

      <nav className="mobile-dashboard-nav" aria-label="Main navigation">
        {[
          { item: "Overview", label: text.overview, icon: "⌂" },
          { item: "My learning", label: text.learning, icon: "▣" },
          { item: "Examinations", label: text.examinations, icon: "◷" },
          { item: "Progress", label: text.progress, icon: "↗" },
          { item: "Book shop", label: text.shop, icon: "▤" },
          { item: "Settings", label: text.settings, icon: "⚙" },
        ].map(({ item, label, icon }) => (
          <button
            key={item}
            className={`nav-item ${activeNav === item ? "active" : ""}`}
            onClick={() => setActiveNav(item)}
            aria-current={activeNav === item ? "page" : undefined}
          >
            <span className="nav-icon" aria-hidden="true">{icon}</span>
            <span className="mobile-dashboard-nav-label">{label}</span>
          </button>
        ))}
      </nav>

      <section className="content-area">
        <header className="topbar">
          <div className="mobile-brand">E-mind<span>.</span></div>
          <div className="breadcrumb">Workspace <span>/</span> {activeNav === "Overview" ? text.overview : activeNav === "My learning" ? text.learning : activeNav === "Examinations" ? text.examinations : activeNav === "Progress" ? text.progress : activeNav === "Book shop" ? text.shop : text.settings}</div>
          <div className="top-actions">
            {authenticated && userRole === "student" && <StudentNotifications label={text.notifications} />}
            <button className="top-avatar" onClick={() => setProfileOpen(true)} aria-label="Open profile">{getInitials(profile.fullName)}</button>
          </div>
        </header>
        <div className="page-content">
          {userRole === "student" && !academicProfileComplete && <p className="admin-upload-error" role="alert">Your academic profile is missing a valid grade or A/L stream. Ask an administrator to update it before exams and question papers can be displayed.</p>}
          {activeNav === "Overview" && <>
          <section className="welcome-row"><div><p className="eyebrow">{new Intl.DateTimeFormat("en-LK", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()).toLocaleUpperCase()}</p><h1>Good morning, {profile.fullName} <span>✦</span></h1><p className="subtitle">A little progress every day adds up to big results.</p></div><button className="outline-button" onClick={() => setProfileOpen(true)}>View profile <span>↗</span></button></section>

          <section className="section-heading"><div><p className="eyebrow">CURATED FOR YOUR PROFILE</p><h2>Keep learning</h2></div><button className="text-button" onClick={() => setActiveNav("My learning")}>See all recommendations <span>→</span></button></section>
          <section className="learning-showcase" aria-label="Learning recommendations">
            <div className="learning-category-grid">
              {learningCategories.map((category) => (
                <article className={`learning-category-card${category.destination ? "" : " coming-soon"}`} key={category.title}>
                  <div className="learning-category-art" style={{ backgroundImage: `linear-gradient(180deg, rgba(20, 47, 41, .06), rgba(20, 47, 41, .52)), url("${category.image}")` }}>
                    <span className="learning-category-icon" aria-hidden="true">{category.icon}</span>
                    <span className="learning-category-summary">{category.summary}</span>
                  </div>
                  <div className="learning-category-copy">
                    <h3>{category.title}</h3>
                    <p>{category.description}</p>
                    {category.destination
                      ? <button className="learning-category-link" onClick={() => { if (category.destination) setActiveNav(category.destination); }}>{category.actionLabel}<span aria-hidden="true">→</span></button>
                      : <span className="learning-category-status">{category.actionLabel}</span>}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="learning-tracker" aria-labelledby="learning-tracker-title">
            <div className="section-heading"><div><p className="eyebrow">YOUR LEARNING JOURNEY</p><h2 id="learning-tracker-title">Progress at a glance</h2></div></div>
            <section className="stats-grid" aria-label="Learning progress">
              <div className="stat-card accent"><div className="stat-label">EXAMS COMPLETED</div><div className="stat-value">{progressSummary?.completedCount ?? "—"}</div><div className="stat-foot">Submitted and marked exams</div></div>
              <div className="stat-card"><div className="stat-label">AVERAGE EXAM SCORE</div><div className="stat-value">{progressSummary?.overallAverage ?? "--"}{progressSummary?.overallAverage !== null && progressSummary?.overallAverage !== undefined && <small>%</small>}</div><div className="stat-foot">{!progressSummary ? "Loading your progress..." : progressSummary.overallAverage === null ? "Complete a marked exam to see your average" : "Across your completed exams"}</div></div>
              <div className="stat-card"><div className="stat-label">SUBJECTS TO PRACTISE</div><div className="stat-value">{progressSummary?.recommendations.length ?? "—"}</div><div className="stat-foot">Based on your marked exam scores</div></div>
            </section>
            {progressSummaryError && <p role="alert" className="admin-upload-error">{progressSummaryError}</p>}
          </section>

          <div className="lower-grid">
            <section>
              <div className="section-heading compact">
                <div><p className="eyebrow">STAY ON TRACK</p><h2>Upcoming examinations</h2></div>
                <button className="text-button" onClick={() => setCalendarOpen(true)}>View calendar <span>→</span></button>
              </div>
              <div className="exam-list">
                {exams.map((exam) => <article className={`exam-row ${exam.tone}`} key={exam.id}><div className="date-block"><strong>{exam.date.split(" ")[0]}</strong><span>{exam.date.split(" ")[1]}</span></div><div className="exam-info"><span className="subject-tag">{exam.subject}</span><h3>{exam.title}</h3><p>{exam.time} <span>·</span> {exam.duration}</p></div><button className="arrow-button" onClick={() => openExam(exam)} aria-label={`Open ${exam.title}`}>↗</button></article>)}
                {writtenPapers.map((paper) => <article className="exam-row mint" key={`paper-${paper.id}`}><div className="date-block"><strong>PDF</strong><span>PAPER</span></div><div className="exam-info"><span className="subject-tag">{paper.subject} · Written paper</span><h3>{paper.title}</h3><p>{paper.durationMins} min <span>·</span> Essay / structured practice</p></div><button className="arrow-button" onClick={() => setActiveNav("Examinations")} aria-label={`Open ${paper.title} written paper`}>↗</button></article>)}
                {exams.length === 0 && writtenPapers.length === 0 && <p className="admin-empty">No upcoming exams or written papers have been published yet.</p>}
              </div>
            </section>
            <section className="progress-panel">
              <div className="section-heading compact">
                <div><p className="eyebrow">YOUR PROGRESS</p><h2>Subject strengths</h2></div>
              </div>
              <div className="progress-bars">
                {progressSummary?.subjects.map((subject, index) => <div className="progress-item" key={subject.subject}>
                  <div><span>{subject.subject}</span><strong>{subject.averagePercentage}%</strong></div>
                  <div className="bar"><i style={{ width: `${subject.averagePercentage}%`, background: ["#2a8c73", "#dfa53e", "#9b6eaa"][index % 3] }} /></div>
                </div>)}
                {progressSummary && progressSummary.subjects.length === 0 && <p className="admin-empty">Complete a marked exam to see your subject scores.</p>}
                {!progressSummary && !progressSummaryError && <p className="admin-empty">Loading your progress...</p>}
              </div>
              <div className="insight"><span>✦</span><p><strong>{leadingRecommendation ? "Practice focus" : "Personalised insight"}</strong><br />{leadingRecommendation?.message ?? (progressSummary ? "Complete a marked exam to see personal practice recommendations." : progressSummaryError || "Loading your personal progress.")}</p></div>
            </section>
          </div>
          </>}

          {activeNav === "My learning" && <section className="nav-page">
            <div className="section-heading"><div><p className="eyebrow">YOUR PERSONALISED LIBRARY</p><h1>My learning</h1><p className="subtitle">Browse video lessons published for your academic profile.</p></div></div>
            <div className="learning-summary">
              <div><span className="eyebrow">AVAILABLE LESSONS</span><h2>{contentVideos.length ? `${contentVideos.length} published lessons` : "No published lessons yet"}</h2><p>{contentVideos.length ? "Choose a lesson below to start learning." : "New lessons will appear here when they are published for your profile."}</p></div>
              <button className="primary-button" disabled={!contentVideos.length} onClick={() => contentVideos[0] && setSelectedVideo(contentVideos[0])}>{contentVideos.length ? "Start first lesson" : "No lessons available"} <span>→</span></button>
            </div>
            <div className="video-grid">
              {contentVideos.map((video) => <article className="video-card" key={video.id}><div className="video-art" style={{ backgroundImage: `url(${video.image})`, backgroundColor: video.color }}><span className="video-duration">{video.duration}</span><button className="play-button" aria-label={`Play ${video.title}`} onClick={() => setSelectedVideo(video)}>▶</button></div><div className="video-copy"><div className="video-meta"><span>{video.subject}</span><span>{video.level}</span></div><h3>{video.title}</h3><button className="watch-button" onClick={() => setSelectedVideo(video)}>Start watching <span>↗</span></button></div></article>)}
              {!contentVideos.length && <p className="admin-empty">No video lessons are available for your academic profile yet.</p>}
            </div>
          </section>}

          {activeNav === "Examinations" && <section className="nav-page">
            {contentError && <p role="alert" className="admin-upload-error">{contentError}</p>}
            <div className="section-heading"><div><p className="eyebrow">QUICK PRACTICE</p><h1>Quiz exams</h1><p className="subtitle">Short quizzes published by your teachers, ready to attempt.</p></div></div>
            {quizExams.length === 0
              ? <p className="admin-empty">No quiz exams have been published yet.</p>
              : <div className="exam-list nav-exam-list">{quizExams.map((exam) => <article className={`exam-row ${exam.tone}`} key={exam.id}>
                <div className="date-block"><strong>{exam.questions.length}</strong><span>QNS</span></div>
                <div className="exam-info"><span className="subject-tag">{exam.subject}</span><h3>{exam.title}</h3><p>{scheduleNow < Date.parse(exam.startsAt) ? `Quiz starts at ${new Date(exam.startsAt).toLocaleString()}` : `${exam.duration} · Quiz exam`}</p></div>
                <button className="primary-button" disabled={scheduleNow < Date.parse(exam.startsAt)} onClick={() => openExam(exam)}>{scheduleNow < Date.parse(exam.startsAt) ? "Not started" : exam.studentAttemptStatus === "IN_PROGRESS" ? "Resume quiz" : exam.studentAttemptStatus === "SUBMITTED" || exam.studentAttemptStatus === "EXPIRED" ? "Retake quiz" : "Start quiz"} <span>→</span></button>
              </article>)}</div>}
          </section>}

          {activeNav === "Examinations" && <section className="nav-page">
            <div className="section-heading"><div><p className="eyebrow">ASSESSMENTS AND DEADLINES</p><h2>Scheduled examinations</h2><p className="subtitle">Stay prepared for every upcoming assessment.</p></div></div>
            {scheduledExams.length === 0
              ? <p className="admin-empty">No scheduled examinations have been published yet.</p>
              : <div className="exam-list nav-exam-list">{scheduledExams.map((exam) => <article className={`exam-row ${exam.tone}`} key={exam.id}>
                <div className="date-block"><strong>{exam.date.split(" ")[0]}</strong><span>{exam.date.split(" ")[1]}</span></div>
                <div className="exam-info"><span className="subject-tag">{exam.subject}</span><h3>{exam.title}</h3><p>{scheduleNow < Date.parse(exam.startsAt) ? `Exam starts at ${new Date(exam.startsAt).toLocaleString()}` : `${exam.time} · ${exam.duration}`}</p></div>
                <button className="primary-button" disabled={scheduleNow < Date.parse(exam.startsAt) || (!exam.canRetake && (exam.studentAttemptStatus === "SUBMITTED" || exam.studentAttemptStatus === "EXPIRED"))} onClick={() => openExam(exam)}>{scheduleNow < Date.parse(exam.startsAt) ? "Not started" : exam.studentAttemptStatus === "IN_PROGRESS" ? "Resume exam" : exam.canRetake && (exam.studentAttemptStatus === "SUBMITTED" || exam.studentAttemptStatus === "EXPIRED") ? "Retake exam" : exam.studentAttemptStatus === "SUBMITTED" ? "Attempt complete" : exam.studentAttemptStatus === "EXPIRED" ? "Attempt expired" : "Open exam"} <span>→</span></button>
              </article>)}</div>}
          </section>}

          {activeNav === "Examinations" && <section className="nav-page written-paper-student-list"><div className="section-heading"><div><p className="eyebrow">ESSAY AND STRUCTURED PRACTICE</p><h2>Question papers</h2><p className="subtitle">Start the exam to begin its timer, then upload your scanned answer paper before time runs out.</p></div></div>{writtenPapers.length === 0 ? <p className="admin-empty">No essay or structured question papers have been published yet.</p> : <div className="written-paper-student-grid">{writtenPapers.map((paper) => <article className="written-paper-student-card" key={paper.id}><div className="written-paper-card-top"><div><span className="subject-tag">{paper.subject} &middot; {paper.educationLevel === "GRADE" ? `Grade${paper.grade ? ` ${paper.grade}` : ""}` : paper.educationLevel === "A_LEVEL" ? "A Level" : "O Level"}{paper.stream ? ` &middot; ${paper.stream}` : ""}</span><h3>{paper.title}</h3><p>{paper.fileName}{paper.fileName.toLowerCase().endsWith(".docx") ? " · Download to open this Word document." : ""}</p></div><a className="primary-button" href={`/api/written-papers/${paper.id}/download`}>Download question paper</a></div>{paper.answerSchemePublished && <p><a className="secondary-button" href={`/api/written-papers/${paper.id}/answer-scheme`}>Download answer scheme</a></p>}{paper.fileName.toLowerCase().endsWith(".pdf") && <iframe className="written-paper-preview" src={`/api/written-papers/${paper.id}/download?inline=1`} title={`${paper.title} question paper`} />}<WrittenPaperAttempt paper={paper} /></article>)}</div>}</section>}
          {activeNav === "Progress" && <StudentProgress refreshKey={progressRefreshKey} />}

          {activeNav === "Book shop" && <section className="nav-page shop-page"><div className="section-heading"><div><p className="eyebrow">STUDY MATERIALS FOR YOUR JOURNEY</p><h1>Book shop</h1><p className="subtitle">Get trusted revision guides and practice papers delivered to you.</p></div><button className="basket-button" onClick={() => setBasket([])} aria-label="Clear basket">Basket <span>{basket.length}</span></button></div><div className="book-grid">{contentBooks.map((book) => { const inBasket = basket.includes(book.title); return <article className={`book-card ${book.color}`} key={book.id}><div className="book-cover" style={book.imageUrl ? { backgroundImage: `url(${book.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}><span>{book.level}</span><strong>{book.subject}</strong><i>E-mind<br />Study Series</i></div><div className="book-copy"><div className="book-meta"><span>{book.subject}</span><span>{book.level}</span></div><h2>{book.title}</h2><p>by {book.author}</p><div className="book-purchase"><strong>{book.price}</strong><button className={inBasket ? "added-button" : "primary-button"} onClick={() => setBasket((current) => inBasket ? current.filter((title) => title !== book.title) : [...current, book.title])}>{inBasket ? "Added ✓" : "Add to basket"}</button></div></div></article>; })}</div>{basket.length > 0 && <div className="basket-bar"><div><strong>{basket.length} {basket.length === 1 ? "book" : "books"} in your basket</strong><span>Online checkout is not available yet. No order has been placed.</span></div><button className="primary-button" disabled>Checkout unavailable</button></div>}</section>}

          {activeNav === "Settings" && <section className="nav-page settings-page"><div className="section-heading"><div><p className="eyebrow">PERSONALISE YOUR SPACE</p><h1>Settings</h1><p className="subtitle">Manage your learning preferences and account experience.</p></div></div><div className="settings-grid"><section className="settings-card"><div className="settings-card-heading"><div><p className="eyebrow">ACCOUNT</p><h2>Profile details</h2></div><span className="settings-avatar">{getInitials(profile.fullName)}</span></div><label>Full name<input value={profile.fullName} readOnly /></label><label>Email address<input value={profile.email} readOnly type="email" /></label><div className="profile-two-col"><label>Education level<input value={profile.educationLevel} readOnly /></label><label>Grade<input value={profile.grade ? `Grade ${profile.grade}` : "Not provided"} readOnly /></label><label>Language<select value={language} onChange={(event) => { setLanguage(event.target.value); setSettingsSaved(false); }}><option>English</option><option>සිංහල</option><option>தமிழ்</option></select></label></div><label>Stream<input value={profile.stream} readOnly /></label><label>Subjects<input value={profile.subjects.length ? profile.subjects.join(", ") : "Not provided"} readOnly /></label></section><section className="settings-card"><div className="settings-card-heading"><div><p className="eyebrow">PREFERENCES</p><h2>Learning experience</h2></div></div><label className="setting-toggle"><span><strong>Study reminders</strong><small>Receive notifications about upcoming exams and goals.</small></span><input type="checkbox" checked={notificationsEnabled} onChange={(event) => { setNotificationsEnabled(event.target.checked); setSettingsSaved(false); }} /></label><label className="setting-toggle"><span><strong>Compact layout</strong><small>Fit more learning information on your dashboard.</small></span><input type="checkbox" checked={compactLayout} onChange={(event) => { setCompactLayout(event.target.checked); setSettingsSaved(false); }} /></label><div className="settings-actions"><span>{settingsSaved ? "Settings saved" : "Changes are saved for this session"}</span><button className="primary-button" onClick={() => setSettingsSaved(true)}>Save settings <span>✓</span></button></div></section></div></section>}
        </div>
      </section>

      {examOpen && activeExam && questions[question] && <div className="modal-backdrop"><section className="exam-modal" role="dialog" aria-modal="true" aria-labelledby="exam-title"><div className="exam-modal-top"><div><span className="subject-tag">{activeExam.subject}</span><h2 id="exam-title">{activeExam.title}</h2></div><button className="close-button" onClick={() => setExamOpen(false)} aria-label="Close examination">×</button></div><div className="timer-strip"><span>TIME REMAINING</span><strong>{formattedTime}</strong><span>QUESTION {question + 1} OF {questions.length}</span></div><div className="question-body" tabIndex={0} aria-label="Question and answer choices"><div className="question-number">{String(question + 1).padStart(2, "0")}</div><div className="question-content"><h3>{questions[question].prompt}</h3>{questions[question].imageUrl && <Image className="student-question-image" src={questions[question].imageUrl} alt={`Image for question ${question + 1}`} width={1200} height={800} unoptimized />}{questions[question].options.map((option, optionIndex) => { const key = String.fromCharCode(65 + optionIndex); const optionImage = questions[question].optionImages?.[optionIndex]; return <label key={key}><input type="radio" name={`answer-${questions[question].id}`} checked={answers[questions[question].id] === key} onChange={() => setAnswers((current) => ({ ...current, [questions[question].id]: key }))} /> <span>{key}</span> {option}{optionImage && <Image className="student-option-image" src={optionImage} alt={`Option ${key}`} width={800} height={600} unoptimized />}</label>; })}</div></div><label className="written-paper-file">Answer sheet document (optional)<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && file.size > 15 * 1024 * 1024) { setExamError("The answer sheet must be no larger than 15 MB."); setAnswerSheetFile(null); event.target.value = ""; return; } setAnswerSheetFile(file); setExamError(""); }} /><small>{answerSheetFile ? `${answerSheetFile.name} is ready to submit.` : "Optional PDF or image, up to 15 MB. It will be sent with your online answers."}</small></label><div className="exam-modal-bottom"><span>{examError || "Submit before the timer ends to save your answers."}</span><div><button className="secondary-button" onClick={() => setQuestion(Math.max(question - 1, 0))}>Previous</button>{question < questions.length - 1 ? <button className="primary-button" onClick={() => setQuestion(question + 1)}>Next question <span>→</span></button> : <button className="primary-button" onClick={() => void submitExam()}>Submit exam <span>✓</span></button>}</div></div></section></div>}
      {calendarOpen && <div className="modal-backdrop" onClick={() => setCalendarOpen(false)}><section className="exam-modal exam-calendar-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-title" onClick={(event) => event.stopPropagation()}><div className="exam-modal-top"><div><span className="eyebrow">SCHEDULED ASSESSMENTS</span><h2 id="calendar-title">Exam calendar</h2></div><button className="close-button" onClick={() => setCalendarOpen(false)} aria-label="Close calendar">×</button></div><div className="calendar-month-controls"><button className="secondary-button" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">←</button><strong>{calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong><button className="secondary-button" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">→</button></div><div className="calendar-grid" role="grid" aria-label={calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}><div className="calendar-weekday">Sun</div><div className="calendar-weekday">Mon</div><div className="calendar-weekday">Tue</div><div className="calendar-weekday">Wed</div><div className="calendar-weekday">Thu</div><div className="calendar-weekday">Fri</div><div className="calendar-weekday">Sat</div>{Array.from({ length: calendarStartOffset }, (_, index) => <div className="calendar-day empty" key={`empty-${index}`} />)}{Array.from({ length: calendarDays }, (_, index) => { const day = index + 1; const dayExams = scheduledExams.filter((exam) => { const start = new Date(exam.startsAt); return start.getFullYear() === calendarMonth.getFullYear() && start.getMonth() === calendarMonth.getMonth() && start.getDate() === day; }); return <div className={`calendar-day${dayExams.length ? " has-exam" : ""}`} key={day}><span>{day}</span>{dayExams.map((exam) => <button className="calendar-exam" key={exam.id} onClick={() => { setCalendarOpen(false); openExam(exam); }} title={`${exam.title} · ${exam.time}`}>{exam.title}</button>)}</div>; })}</div>{scheduledExams.length === 0 && <p className="admin-empty">No scheduled exams are available yet. Published written papers appear in the examinations section.</p>}</section></div>}
      {examResult && <div className="modal-backdrop"><section className="exam-modal exam-result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title"><div className="exam-modal-top"><div><span className="subject-tag">EXAM RESULT</span><h2 id="result-title">{activeExam?.title}</h2></div><button className="close-button" onClick={() => setExamResult(null)} aria-label="Close result">×</button></div><div className="question-body"><div className="question-number">{Math.round(examResult.percentage)}%</div><div className="question-content"><h3>{examResult.percentage < 70 ? `Let's strengthen ${activeExam?.subject ?? "this subject"}.` : examResult.passed ? "Congratulations, you passed." : "Keep practising and try again."}</h3><p>You scored {examResult.obtainedMarks} of {examResult.totalMarks} marks ({examResult.percentage}%). {examResult.percentage < 70 ? "Your Progress page has practice suggestions based on your scores." : "Your result is saved to your Progress page."}</p></div></div><section className="exam-review-sheet" aria-label="Exam answer review"><h3>Answer review</h3>{examResult.review.map((item, index) => { const selectedIndex = item.selectedAnswer ? item.selectedAnswer.charCodeAt(0) - 65 : -1; const correctIndex = item.correctAnswer.charCodeAt(0) - 65; return <article className="exam-review-question" key={item.questionId}><div className="exam-review-heading"><strong>Question {String(index + 1).padStart(2, "0")}</strong><span className={item.isCorrect ? "review-correct" : "review-incorrect"}>{item.isCorrect ? "Correct" : "Incorrect"}</span></div><h4>{item.prompt}</h4>{item.imageUrl && <Image className="student-question-image" src={item.imageUrl} alt={`Image for question ${index + 1}`} width={1200} height={800} unoptimized />}<p className={item.isCorrect ? "review-correct" : "review-incorrect"}><strong>Your answer:</strong> {selectedIndex >= 0 ? `${item.selectedAnswer}: ${item.options[selectedIndex]}` : "Not answered"}</p><p className="review-correct"><strong>Correct answer:</strong> {item.correctAnswer}: {item.options[correctIndex]}</p></article>; })}</section><div className="exam-modal-bottom"><span>Saved to your examination results.</span><button className="primary-button" onClick={() => setExamResult(null)}>Done</button></div></section></div>}
      {profileOpen && <ProfileModal profile={profile} onClose={() => setProfileOpen(false)} onSignOut={async () => { setProfileOpen(false); await handleSignOut(); }} />}
      {authenticated && <div className="assistant-widget"><button className="assistant-launcher" onClick={() => setAssistantOpen((open) => !open)} aria-label={assistantOpen ? "Close E-mind assistant" : "Open E-mind assistant"}>{assistantOpen ? "×" : "✦"}<span className="assistant-pulse" /></button>{assistantOpen && <section className="assistant-panel" role="dialog" aria-label="E-mind support assistant"><div className="assistant-head"><div><span className="assistant-avatar">✦</span><div><strong>E-mind assistant</strong><small>Here to help</small></div></div><button onClick={() => setAssistantOpen(false)} aria-label="Close assistant">×</button></div><div className="assistant-messages">{assistantMessages.map((message, index) => <p className={`assistant-message ${message.from}`} key={`${message.from}-${index}`}>{message.text}</p>)}</div><div className="assistant-quick-actions"><button onClick={() => askAssistant("exams", "Show my exams")}>My exams</button><button onClick={() => askAssistant("learning", "Help with learning")}>Learning help</button><button onClick={() => askAssistant("books", "Where are the books?")}>Book shop</button></div><form className="assistant-form" onSubmit={submitAssistantMessage}><input value={assistantInput} onChange={(event) => setAssistantInput(event.target.value)} placeholder="Ask for support..." aria-label="Ask the assistant" /><button type="submit" aria-label="Send message">↑</button></form></section>}</div>}
    </main>
  );
}
