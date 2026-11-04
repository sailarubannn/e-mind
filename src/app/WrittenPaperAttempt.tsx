"use client";

import { useEffect, useState } from "react";

type Props = { paper: { id: string; title: string; fileName: string; durationMins: number; startsAt: string | null; endsAt: string | null }; now: number };

export default function WrittenPaperAttempt({ paper, now }: Props) {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [submittedFile, setSubmittedFile] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (deadline === null) return;
    const update = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [deadline]);

  async function startAttempt() {
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/written-papers/${paper.id}/attempt`, { method: "POST" });
      const result = await response.json() as { expiresAt?: string; startsAt?: string; submittedAt?: string | null; fileName?: string | null; error?: string };
      if (!response.ok || !result.expiresAt) {
        const startTime = result.startsAt ? new Date(result.startsAt) : null;
        throw new Error(startTime && Number.isFinite(startTime.getTime())
          ? `This exam starts at ${startTime.toLocaleString()}.`
          : result.error ?? "Could not start this exam.");
      }
      const parsed = Date.parse(result.expiresAt);
      if (!Number.isFinite(parsed)) throw new Error("The exam returned an invalid deadline.");
      setDeadline(parsed);
      setSubmittedFile(result.submittedAt ? result.fileName ?? "Answer paper" : "");
      if (result.submittedAt) setMessage("Your answer paper has been submitted.");
    } catch (startError) { setError(startError instanceof Error ? startError.message : "Could not start this exam."); }
    finally { setLoading(false); }
  }

  async function submitAnswer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) { setError("Choose your scanned answer paper first."); return; }
    setLoading(true); setError(""); setMessage("");
    const form = new FormData(); form.set("file", file);
    try {
      const response = await fetch(`/api/written-papers/${paper.id}/attempt`, { method: "POST", body: form });
      const result = await response.json() as { fileName?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Your answer paper could not be submitted.");
      setSubmittedFile(result.fileName ?? file.name); setFile(null); setMessage("Answer paper submitted successfully.");
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Your answer paper could not be submitted."); }
    finally { setLoading(false); }
  }

  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const started = deadline !== null;
  const expired = started && seconds <= 0 && !submittedFile;
  const notStarted = paper.startsAt !== null && now < Date.parse(paper.startsAt);
  return <section className="written-attempt-portal" aria-label={`${paper.title} answer portal`}>
    <div className="written-attempt-heading"><div><strong>Exam time: {paper.durationMins} minutes</strong><small>{submittedFile ? `Submitted: ${submittedFile}` : started ? expired ? "Time is up. The upload portal is closed." : "Upload your scanned answer paper before the timer or scheduled end time." : notStarted ? `Exam starts at ${new Date(paper.startsAt!).toLocaleString()}.` : "Start the exam to begin your timer and open the answer upload portal."}</small></div>
      {!started && <button className="primary-button" onClick={() => void startAttempt()} disabled={loading || notStarted}>{notStarted ? "Not started" : "Start exam"}</button>}
    </div>
    {started && <div className={`written-attempt-timer${seconds < 60 ? " urgent" : ""}`}><span>TIME REMAINING</span><strong>{time}</strong>{!submittedFile && !expired && <button className="secondary-button" onClick={() => void startAttempt()} disabled={loading}>Refresh status</button>}</div>}
    {started && !submittedFile && !expired && <form className="written-answer-upload" onSubmit={(event) => void submitAnswer(event)}><label>Scanned answer paper (PDF or image)<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); }} /><small>One final submission, up to 15 MB. Make sure all pages are clear and included.</small></label><button className="primary-button" type="submit" disabled={loading || !file}>{loading ? "Submitting…" : "Submit answer paper"}</button></form>}
    {error && <p className="admin-upload-error" role="alert">{error}</p>}{message && <p className="admin-upload-status" role="status">{message}</p>}
  </section>;
}
