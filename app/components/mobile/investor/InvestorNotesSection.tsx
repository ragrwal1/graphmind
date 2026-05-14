"use client";

import { Mic2, StickyNote } from "lucide-react";
import type { MemberNote } from "@/app/lib/memberNotes";

type Props = {
  notes: MemberNote[];
  status: "loading" | "ready" | "error";
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));

export function InvestorNotesSection({ notes, status }: Props) {
  return (
    <section className="mobile-card-section">
      <h3 className="mobile-card-section-title">Notes log</h3>

      {status === "loading" && (
        <p className="mobile-card-section-empty">Loading…</p>
      )}

      {status === "error" && (
        <p className="mobile-card-section-empty error">Could not load notes.</p>
      )}

      {status === "ready" && notes.length === 0 && (
        <p className="mobile-card-section-empty">
          No notes yet. Record a session to add some.
        </p>
      )}

      {status === "ready" && notes.length > 0 && (
        <div className="mobile-notes-list">
          {notes.map((note) => (
            <div key={note.id} className="mobile-note-row">
              <div className="mobile-note-meta">
                <span className="mobile-note-source">
                  {note.source === "voice" ? (
                    <Mic2 size={13} strokeWidth={1.75} />
                  ) : (
                    <StickyNote size={13} strokeWidth={1.75} />
                  )}
                </span>
                <span className="mobile-note-date">{formatDate(note.occurred_at)}</span>
              </div>
              <p className="mobile-note-text">{note.note_text}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
