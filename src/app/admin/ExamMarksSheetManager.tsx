"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type MarksSheetExam = {
  id: string;
  title: string;
  published: boolean;
  startsAt: string;
  marksSheetFileName: string | null;
  marksSheetPublishedAt: string | null;
  participantCount: number;
};

export default function ExamMarksSheetManager() {
  const [exams, setExams] = useState<MarksSheetExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const loadExams = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/exams/marks-sheets", { cache: "no-store" });
      const result = await response.json() as { items?: MarksSheetExam[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not load exams.");
      const items = result.items ?? [];
      setExams(items);
      setSelectedExamId((current) => items.some((exam) => exam.id === current) ? current : items[0]?.id ?? "");
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load exams.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadExams();
  }, [loadExams]);

  const selectedExam = exams.find((exam) => exam.id === selectedExamId) ?? null;

  async function publishMarksSheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedExam || !file) {
      setError("Choose an exam and its marks sheet document.");
      return;
    }
    setPublishing(true);
    setError("");
    setStatus("");
    const formElement = event.currentTarget;
    try {
      const formData = new FormData();
      formData.set("marksSheet", file);
      const response = await fetch(`/api/admin/exams/${selectedExam.id}/marks-sheet`, { method: "POST", body: formData });
      const result = await response.json() as { error?: string; notifiedStudents?: number; fileName?: string };
      if (!response.ok) throw new Error(result.error ?? "The marks sheet could not be published.");
      setStatus(`Published ${result.fileName ?? file.name}. ${result.notifiedStudents ?? 0} participating student${result.notifiedStudents === 1 ? "" : "s"} notified.`);
      setFile(null);
      const input = formElement.elements.namedItem("marksSheet") as HTMLInputElement | null;
      if (input) input.value = "";
      await loadExams();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "The marks sheet could not be published.");
    } finally {
      setPublishing(false);
    }
  }

  return <section className="admin-marks-sheet-manager">
    <div className="admin-page-heading">
      <div>
        <p className="eyebrow">EXAM RESULTS</p>
        <h2>Publish marks sheets</h2>
        <p>Upload an exam marks sheet document. Students who participated will receive an in-app notification.</p>
      </div>
      <button type="button" className="secondary-button" onClick={() => void loadExams()} disabled={loading}>Refresh</button>
    </div>
    {error && <p className="admin-upload-error" role="alert">{error}</p>}
    {status && <p className="admin-upload-status" role="status">{status}</p>}
    {loading ? <p className="admin-empty">Loading exams...</p> : exams.length === 0 ? <p className="admin-empty">No exams are available yet.</p> : <form className="admin-editor admin-marks-sheet-form" onSubmit={(event) => void publishMarksSheet(event)}>
      <div className="admin-editor-fields">
        <label>Exam
          <select value={selectedExamId} onChange={(event) => setSelectedExamId(event.target.value)} required>
            {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}{exam.published ? "" : " · Draft"}</option>)}
          </select>
        </label>
        <label>Marks sheet document
          <input name="marksSheet" type="file" accept=".pdf,.xls,.xlsx,.doc,.docx,.csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
          <small>PDF, Excel, Word, or CSV document, up to 4 MB.</small>
        </label>
      </div>
      {selectedExam && <div className="admin-marks-sheet-status">
        <span>{selectedExam.participantCount} participating student{selectedExam.participantCount === 1 ? "" : "s"} will be notified.</span>
        {selectedExam.marksSheetFileName && selectedExam.marksSheetPublishedAt && <span>Current document: <a href={`/api/admin/exams/${selectedExam.id}/marks-sheet`}>{selectedExam.marksSheetFileName}</a> · Published {new Date(selectedExam.marksSheetPublishedAt).toLocaleString()}</span>}
      </div>}
      <div className="admin-editor-footer">
        <span>Publishing a replacement sends a new notification to participating students.</span>
        <button type="submit" className="primary-button" disabled={publishing || !selectedExam?.published || !file}>{publishing ? "Publishing..." : selectedExam?.marksSheetFileName ? "Publish updated marks sheet" : "Publish marks sheet"}</button>
      </div>
      {selectedExam && !selectedExam.published && <p className="admin-upload-error">Publish the exam before uploading its marks sheet.</p>}
    </form>}
  </section>;
}
