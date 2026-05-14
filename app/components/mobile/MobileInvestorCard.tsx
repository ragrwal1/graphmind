"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Home } from "lucide-react";
import type { MemberSeed } from "@/app/lib/members";
import type { MemberNote, MemberMemoryOverview } from "@/app/lib/memberNotes";
import { InvestorMemorySection } from "./investor/InvestorMemorySection";
import { InvestorNotesSection } from "./investor/InvestorNotesSection";

// ─── Section registry ─────────────────────────────────────────
// Add new SectionIds here and handle them in renderSection() below.
type SectionId = "memory" | "notes";
const SECTIONS: SectionId[] = ["memory", "notes"];
// ─────────────────────────────────────────────────────────────

type NotesState = {
  status: "loading" | "ready" | "error";
  notes: MemberNote[];
  overview: MemberMemoryOverview | null;
  error?: string;
};

type Props = {
  member: MemberSeed;
  onBack: () => void;
  onClose: () => void;
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function MobileInvestorCard({ member, onBack, onClose }: Props) {
  const [notesState, setNotesState] = useState<NotesState>({
    status: "loading",
    notes: [],
    overview: null,
  });

  useEffect(() => {
    setNotesState({ status: "loading", notes: [], overview: null });
    fetch(`/api/members/${encodeURIComponent(member.airtable_id)}/notes`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        setNotesState({
          status: "ready",
          notes: data.notes ?? [],
          overview: data.overview ?? null,
        });
      })
      .catch((err) => {
        setNotesState({
          status: "error",
          notes: [],
          overview: null,
          error: err instanceof Error ? err.message : "Failed to load",
        });
      });
  }, [member.airtable_id]);

  function renderSection(id: SectionId) {
    switch (id) {
      case "memory":
        return (
          <InvestorMemorySection
            key="memory"
            overview={notesState.overview}
            status={notesState.status}
          />
        );
      case "notes":
        return (
          <InvestorNotesSection
            key="notes"
            notes={notesState.notes}
            status={notesState.status}
          />
        );
    }
  }

  return (
    <div className="mobile-investor-card-overlay">
      {/* Nav bar */}
      <div className="mobile-card-nav">
        <button className="mobile-card-back" onClick={onBack} aria-label="Back to results">
          <ArrowLeft size={20} strokeWidth={1.75} />
        </button>
        <button className="mobile-card-home" onClick={onClose} aria-label="Go home">
          <Home size={18} strokeWidth={1.75} />
        </button>
      </div>

      <div className="mobile-card-scroll">
        {/* Header */}
        <div className="mobile-card-header">
          <div className="mobile-card-avatar">{getInitials(member.name)}</div>
          <h2 className="mobile-card-name">{member.name}</h2>
          {member.related_organization && (
            <p className="mobile-card-org">
              {member.related_organization}
            </p>
          )}
          {member.aliases.length > 0 && (
            <div className="mobile-card-aliases">
              {member.aliases.map((alias) => (
                <span key={alias} className="mobile-card-alias-pill">
                  {alias}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pluggable sections */}
        {SECTIONS.map(renderSection)}
      </div>
    </div>
  );
}
