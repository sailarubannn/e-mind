"use client";

import { useCallback, useEffect, useState } from "react";

type MarksSheetNotification = {
  id: string;
  createdAt: string;
  readAt: string | null;
  exam: { id: string; title: string; marksSheetFileName: string | null; marksSheetPublishedAt: string | null };
};

export default function StudentNotifications({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MarksSheetNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/student/notifications", { cache: "no-store" });
      const result = await response.json() as { items?: MarksSheetNotification[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Notifications could not be loaded.");
      setItems(result.items ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Notifications could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadNotifications();
  }, [loadNotifications]);

  const unreadCount = items.filter((item) => !item.readAt).length;

  async function markRead(id?: string) {
    setError("");
    try {
      const response = await fetch("/api/student/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { markAllRead: true }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Notifications could not be marked as read.");
      const readAt = new Date().toISOString();
      setItems((current) => current.map((item) => !id || item.id === id ? { ...item, readAt: item.readAt ?? readAt } : item));
      return true;
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Notifications could not be marked as read.");
      return false;
    }
  }

  return <div className="notification-wrap">
    <button className="icon-button" aria-label={label} aria-expanded={open} onClick={() => { const next = !open; setOpen(next); if (next) void loadNotifications(); }}>♧{unreadCount > 0 && <span className="notification-dot" />}</button>
    {open && <section className="notification-panel" role="dialog" aria-label={label}>
      <div className="notification-head">
        <div><span className="eyebrow">YOUR UPDATES</span><h2>{label}</h2></div>
        <button className="notification-close" onClick={() => setOpen(false)} aria-label="Close notifications">×</button>
      </div>
      {error && <p className="notification-error" role="alert">{error}</p>}
      <div className="notification-list">
        {loading && items.length === 0 ? <p className="notification-empty">Loading notifications...</p> : items.length === 0
          ? <p className="notification-empty">No marks-sheet notifications yet.</p>
          : items.map((item) => <article className={`notification-item${item.readAt ? "" : " unread"}`} key={item.id}>
            <span className="notification-symbol">▤</span>
            <div>
              <strong>Marks sheet published</strong>
              <p>{item.exam.title} marks sheet is now available.</p>
              <small>{new Date(item.createdAt).toLocaleString()}</small>
              <a className="notification-download" href={`/api/exams/${item.exam.id}/marks-sheet`} onClick={() => { if (!item.readAt) void markRead(item.id); }}>Download {item.exam.marksSheetFileName ?? "marks sheet"}</a>
            </div>
          </article>)}
      </div>
      {items.length > 0 && <button className="mark-read-button" disabled={unreadCount === 0} onClick={() => void markRead()}>{unreadCount > 0 ? "Mark all as read" : "All caught up"}</button>}
    </section>}
  </div>;
}
