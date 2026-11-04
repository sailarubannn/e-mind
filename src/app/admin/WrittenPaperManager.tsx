"use client";

import { useEffect, useState, type FormEvent } from "react";
import { gradeRange, type AcademicLevel } from "@/lib/academic-eligibility";

type Submission = { id: string; fileName: string | null; submittedAt: string | null; student?: { fullName: string; email: string; mobileNumber: string | null } };
type WrittenPaper = { id: string; title: string; subject: string; educationLevel: string; grade: number | null; stream: string | null; fileName: string; durationMins: number; startsAt: string | null; endsAt: string | null; published: boolean; answerSchemeFileName: string | null; answerSchemePublished: boolean; createdAt: string; submissions: Submission[] };

const levelLabels: Record<string, string> = { GRADE: "Grade 6-11", O_LEVEL: "O Level", A_LEVEL: "A Level" };

export default function WrittenPaperManager() {
  const [papers, setPapers] = useState<WrittenPaper[]>([]);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [educationLevel, setEducationLevel] = useState<AcademicLevel>("A_LEVEL");
  const [grade, setGrade] = useState("");
  const [stream, setStream] = useState("");
  const [durationMins, setDurationMins] = useState("60");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [answerSchemeFiles, setAnswerSchemeFiles] = useState<Record<string, File | null>>({});
  const [answerSchemeLoadingId, setAnswerSchemeLoadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const gradeLimits = gradeRange(educationLevel);

  async function loadPapers() {
    try {
      const response = await fetch("/api/admin/written-papers", { cache: "no-store" });
      const result = await response.json() as { items?: WrittenPaper[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not load written papers.");
      setPapers(result.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load written papers.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/written-papers", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { items?: WrittenPaper[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load written papers.");
        if (!cancelled) setPapers(result.items ?? []);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load written papers.");
      });
    return () => { cancelled = true; };
  }, []);

  async function savePaper(event: FormEvent<HTMLFormElement>, published: boolean) {
    event.preventDefault();
    if (!file) { setError("Choose the PDF or DOCX paper you want students to download."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("The paper must be smaller than 10 MB."); return; }
    if (!startsAt || !endsAt || !Number.isFinite(new Date(startsAt).getTime()) || !Number.isFinite(new Date(endsAt).getTime()) || new Date(endsAt) <= new Date(startsAt)) {
      setError("Choose a valid exam end date and time after the start date and time.");
      return;
    }
    setLoading(true); setError(""); setStatus("");
    const form = new FormData();
    form.set("file", file); form.set("title", title); form.set("subject", subject);
    form.set("educationLevel", educationLevel); form.set("grade", grade); form.set("stream", stream);
    form.set("durationMins", durationMins); form.set("published", String(published));
    form.set("startsAt", new Date(startsAt).toISOString()); form.set("endsAt", new Date(endsAt).toISOString());
    try {
      const response = await fetch("/api/admin/written-papers", { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save the written paper.");
      setStatus(published ? "Paper published and available for students." : "Paper saved as a draft.");
      setTitle(""); setSubject(""); setGrade(""); setStream(""); setDurationMins("60"); setStartsAt(""); setEndsAt(""); setFile(null);
      const picker = document.getElementById("written-paper-file") as HTMLInputElement | null;
      if (picker) picker.value = "";
      await loadPapers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the written paper.");
    } finally { setLoading(false); }
  }

  async function togglePublished(paper: WrittenPaper) {
    setError(""); setStatus("");
    const response = await fetch(`/api/admin/written-papers/${paper.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published: !paper.published }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setError(result.error ?? "Could not update publication status."); return; }
    setStatus(paper.published ? "Paper moved back to drafts." : "Paper published and available for students.");
    await loadPapers();
  }

  async function saveAudience(event: FormEvent<HTMLFormElement>, paper: WrittenPaper) {
    event.preventDefault();
    setError(""); setStatus("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/written-papers/${paper.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        educationLevel: form.get("educationLevel"),
        grade: Number(form.get("grade")),
        stream: form.get("stream"),
      }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setError(result.error ?? "Could not update the paper audience."); return; }
    setStatus("Student audience updated.");
    await loadPapers();
  }

  async function uploadAnswerScheme(paper: WrittenPaper) {
    const schemeFile = answerSchemeFiles[paper.id];
    if (!schemeFile) {
      setError("Choose a PDF or DOCX answer scheme to upload.");
      return;
    }
    if (schemeFile.size > 10 * 1024 * 1024) {
      setError("The answer scheme must be no larger than 10 MB.");
      return;
    }

    setAnswerSchemeLoadingId(paper.id); setError(""); setStatus("");
    const form = new FormData();
    form.set("file", schemeFile);
    try {
      const response = await fetch(`/api/admin/written-papers/${paper.id}/answer-scheme`, { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not upload the answer scheme.");
      setStatus("Answer scheme uploaded. Publish it when it is ready for students.");
      setAnswerSchemeFiles((current) => ({ ...current, [paper.id]: null }));
      await loadPapers();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload the answer scheme.");
    } finally {
      setAnswerSchemeLoadingId(null);
    }
  }

  async function toggleAnswerScheme(paper: WrittenPaper) {
    setAnswerSchemeLoadingId(paper.id); setError(""); setStatus("");
    try {
      const publish = !paper.answerSchemePublished;
      const response = await fetch(`/api/admin/written-papers/${paper.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerSchemePublished: publish }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not update answer scheme availability.");
      setStatus(publish ? "Answer scheme published for students." : "Answer scheme unpublished.");
      await loadPapers();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Could not update answer scheme availability.");
    } finally {
      setAnswerSchemeLoadingId(null);
    }
  }

  async function deletePaper(paper: WrittenPaper) {
    if (!window.confirm(`Delete "${paper.title}" and its uploaded document?`)) return;
    const response = await fetch(`/api/admin/written-papers/${paper.id}`, { method: "DELETE" });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setError(result.error ?? "Could not delete the paper."); return; }
    setStatus("Written paper deleted."); await loadPapers();
  }

  return <section className="written-paper-manager">
    <div className="admin-page-heading"><div><p className="eyebrow">ESSAY AND STRUCTURED ASSESSMENTS</p><h2>Essay &amp; structured papers</h2><p>Upload the original paper and publish it with a time limit for students.</p></div></div>
    {status && <p className="admin-upload-status">{status}</p>}{error && <p className="admin-upload-error">{error}</p>}
    <form className="admin-editor" onSubmit={(event) => void savePaper(event, (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-published") === "true")}>
      <div className="admin-editor-fields">
        <label>Paper title<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Grade 11 Science Structured Paper" /></label>
        <label>Subject<input required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Biology" /></label>
        <label>Start date and time<input type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
        <label>End date and time<input type="datetime-local" required min={startsAt || undefined} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /><small>Student uploads close at this time, even if their duration timer has time left.</small></label>
        <label>Exam duration (minutes)<input type="number" required min="1" max="600" value={durationMins} onChange={(event) => setDurationMins(event.target.value)} /><small>Students receive this time after they start, up to the scheduled end.</small></label>
        <label>Education level<select value={educationLevel} onChange={(event) => { setEducationLevel(event.target.value as AcademicLevel); setGrade(""); setStream(""); }}><option value="GRADE">Grade 6-11</option><option value="O_LEVEL">O Level</option><option value="A_LEVEL">A Level</option></select></label>
        <label>Grade<input type="number" required min={gradeLimits.min} max={gradeLimits.max} value={grade} onChange={(event) => setGrade(event.target.value)} placeholder={`Grade ${gradeLimits.min}-${gradeLimits.max}`} /></label>
        {educationLevel === "A_LEVEL" && <label>Stream<input required value={stream} onChange={(event) => setStream(event.target.value)} placeholder="e.g. Biological Science" /></label>}
        <label className="written-paper-file">Question paper (PDF or DOCX)<input id="written-paper-file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); setStatus(""); }} /><small>Up to 10 MB.</small></label>
      </div>
      <div className="admin-editor-footer"><span>{file ? `Ready to upload: ${file.name}` : "Choose the question paper document to upload."}</span><div><button type="submit" data-published="false" className="secondary-button" disabled={loading || !file}>{loading ? "Saving..." : "Save as draft"}</button><button type="submit" data-published="true" className="primary-button" disabled={loading || !file}>Publish to students</button></div></div>
    </form>
    <section className="admin-record-list"><div className="admin-record-list-head"><strong>{papers.length} written papers</strong><button className="secondary-button" onClick={() => void loadPapers()}>Refresh</button></div>
      {papers.length === 0 ? <p className="admin-empty">No essay or structured papers yet.</p> : papers.map((paper) => (
        <article className="admin-record written-paper-record" key={paper.id}>
          <div>
            <strong>{paper.title} - {paper.subject}</strong>
            <small>{paper.published ? "Published" : "Draft"} - {paper.durationMins} minutes - {paper.startsAt ? new Date(paper.startsAt).toLocaleString() : "No start set"} to {paper.endsAt ? new Date(paper.endsAt).toLocaleString() : "No end set"} - {levelLabels[paper.educationLevel] ?? paper.educationLevel}{paper.grade ? ` ${paper.grade}` : ""}{paper.stream ? ` - ${paper.stream}` : ""} - {paper.fileName}</small>
            <details>
              <summary>Update student audience</summary>
              <form className="admin-editor" onSubmit={(event) => void saveAudience(event, paper)}>
                <label>Education level<select name="educationLevel" defaultValue={paper.educationLevel}><option value="GRADE">Grade 6-11</option><option value="O_LEVEL">O Level</option><option value="A_LEVEL">A Level</option></select></label>
                <label>Grade<input name="grade" type="number" required min="6" max="13" defaultValue={paper.grade ?? ""} /></label>
                <label>A/L stream<input name="stream" defaultValue={paper.stream ?? ""} placeholder="Required for A/L papers" /></label>
                <button type="submit" className="secondary-button">Save student audience</button>
              </form>
            </details>
            <details className="written-paper-scheme-admin">
              <summary>{paper.answerSchemeFileName ? `Answer scheme: ${paper.answerSchemeFileName} · ${paper.answerSchemePublished ? "Published" : "Not published"}` : "Upload answer scheme"}</summary>
              <p>Upload the answer scheme after the exam. Students cannot access it until you publish it.</p>
              <label>Answer scheme document (PDF or DOCX)<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { setAnswerSchemeFiles((current) => ({ ...current, [paper.id]: event.target.files?.[0] ?? null })); setError(""); setStatus(""); }} /><small>Up to 10 MB. Uploading a replacement makes it unpublished until you publish it again.</small></label>
              <div className="admin-record-actions"><button type="button" className="secondary-button" disabled={answerSchemeLoadingId === paper.id || !answerSchemeFiles[paper.id]} onClick={() => void uploadAnswerScheme(paper)}>{answerSchemeLoadingId === paper.id ? "Saving..." : "Upload answer scheme"}</button>{paper.answerSchemeFileName && <button type="button" disabled={answerSchemeLoadingId === paper.id} onClick={() => void toggleAnswerScheme(paper)}>{paper.answerSchemePublished ? "Unpublish answer scheme" : "Publish answer scheme"}</button>}</div>
            </details>
            {paper.submissions.length > 0 && <details><summary>{paper.submissions.length} submitted answer paper{paper.submissions.length === 1 ? "" : "s"}</summary><ul>{paper.submissions.map((submission) => <li key={submission.id}>{submission.student?.fullName ?? "Student"} ({submission.student?.email ?? ""}) · Mobile: {submission.student?.mobileNumber || "Not provided"} · {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : ""} · <a href={`/api/admin/written-papers/${paper.id}/submissions/${submission.id}`}>Download {submission.fileName ?? "answer paper"}</a></li>)}</ul></details>}
          </div>
          <div className="admin-record-actions"><a href={`/api/written-papers/${paper.id}/download`} className="secondary-button">Download paper</a><button onClick={() => void togglePublished(paper)}>{paper.published ? "Unpublish" : "Publish"}</button><button className="danger-button" onClick={() => void deletePaper(paper)}>Delete</button></div>
        </article>
      ))}
    </section>
  </section>;
}
