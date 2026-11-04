"use client";

import { useEffect, useState } from "react";

type Submission = {
  id: string;
  fileName: string | null;
  submittedAt: string | null;
  student?: { fullName: string; email: string; mobileNumber: string | null };
};

type WrittenPaper = {
  id: string;
  title: string;
  subject: string;
  submissions: Submission[];
};

type AnswerDocument = Submission & {
  paperId: string;
  paperTitle: string;
  subject: string;
};

function flattenDocuments(papers: WrittenPaper[]) {
  const documents = papers.flatMap((paper) =>
    paper.submissions.map((submission) => ({
      ...submission,
      paperId: paper.id,
      paperTitle: paper.title,
      subject: paper.subject,
    })),
  );
  documents.sort((left, right) =>
    Date.parse(right.submittedAt ?? "") - Date.parse(left.submittedAt ?? ""),
  );
  return documents;
}

export default function AnswerDocumentsManager() {
  const [documents, setDocuments] = useState<AnswerDocument[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const paperOptions = [...new Map(documents.map((document) => [
    document.paperId,
    { id: document.paperId, title: document.paperTitle, subject: document.subject },
  ])).values()].sort((left, right) => left.title.localeCompare(right.title));
  const filteredDocuments = selectedPaperId === "all"
    ? documents
    : documents.filter((document) => document.paperId === selectedPaperId);
  const groupedDocuments = [...filteredDocuments.reduce((groups, document) => {
    const group = groups.get(document.paperId) ?? [];
    group.push(document);
    groups.set(document.paperId, group);
    return groups;
  }, new Map<string, AnswerDocument[]>()).entries()]
    .map(([paperId, submissions]) => ({
      paperId,
      paperTitle: submissions[0].paperTitle,
      subject: submissions[0].subject,
      submissions,
    }))
    .sort((left, right) => left.paperTitle.localeCompare(right.paperTitle));

  async function loadDocuments() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/written-papers", { cache: "no-store" });
      const result = await response.json() as { items?: WrittenPaper[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not load answer documents.");
      setDocuments(flattenDocuments(result.items ?? []));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load answer documents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let current = true;
    fetch("/api/admin/written-papers", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { items?: WrittenPaper[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load answer documents.");
        if (current) setDocuments(flattenDocuments(result.items ?? []));
      })
      .catch((loadError: unknown) => {
        if (current) setError(loadError instanceof Error ? loadError.message : "Could not load answer documents.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, []);

  return <section className="answer-documents-page">
    <div className="admin-page-heading">
      <div>
        <p className="eyebrow">STUDENT SUBMISSIONS</p>
        <h2>Answer documents</h2>
        <p>Review and download scanned answer papers submitted for essay and structured exams.</p>
      </div>
      <button type="button" className="secondary-button" onClick={() => void loadDocuments()} disabled={loading}>
        {loading ? "Refreshing..." : "Refresh"}
      </button>
    </div>
    {error && <p className="admin-upload-error" role="alert">{error}</p>}
    {loading
      ? <p className="admin-empty">Loading submitted answer documents...</p>
      : documents.length === 0
        ? <p className="admin-empty">No student answer documents have been submitted yet.</p>
        : <div className="answer-document-list">
          <div className="answer-document-controls">
            <label htmlFor="answer-document-paper-filter">Filter by exam paper</label>
            <select id="answer-document-paper-filter" value={selectedPaperId} onChange={(event) => setSelectedPaperId(event.target.value)}>
              <option value="all">All exam papers ({documents.length})</option>
              {paperOptions.map((paper) => {
                const count = documents.filter((document) => document.paperId === paper.id).length;
                return <option key={paper.id} value={paper.id}>{paper.title} · {paper.subject} ({count})</option>;
              })}
            </select>
            <strong>{filteredDocuments.length} answer document{filteredDocuments.length === 1 ? "" : "s"}</strong>
          </div>
          {groupedDocuments.map((group) => <details className="answer-document-group" key={group.paperId}>
            <summary>
              <span><strong>{group.paperTitle}</strong><small>{group.subject}</small></span>
              <span className="answer-document-group-count">{group.submissions.length} document{group.submissions.length === 1 ? "" : "s"}</span>
            </summary>
            <div className="answer-document-group-list">
              {group.submissions.map((document) => <article className="answer-document-card" key={document.id}>
                <div className="answer-document-details">
                  <h3>{document.student?.fullName ?? "Student account unavailable"}</h3>
                  <p>{document.student?.email ?? "Email unavailable"} · {document.student?.mobileNumber || "Mobile not provided"}</p>
                  <dl>
                    <div><dt>Answer document</dt><dd>{document.fileName ?? "Answer paper"}</dd></div>
                    <div><dt>Submitted</dt><dd>{document.submittedAt ? new Date(document.submittedAt).toLocaleString() : "Submission time unavailable"}</dd></div>
                  </dl>
                </div>
                <a className="answer-document-download" href={`/api/admin/written-papers/${document.paperId}/submissions/${document.id}`}>
                  Download answer document <span aria-hidden="true">↓</span>
                </a>
              </article>)}
            </div>
          </details>)}
        </div>}
  </section>;
}
