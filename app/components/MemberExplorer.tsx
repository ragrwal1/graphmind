"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Send,
  Mic2,
  StickyNote,
  Square,
  CheckSquare,
  Trash2,
  X
} from "lucide-react";
import type { MemberSeed } from "@/app/lib/members";
import type { MemberMemoryOverview, MemberNote } from "@/app/lib/memberNotes";

type MemberExplorerProps = {
  members: MemberSeed[];
  initialSelectedId?: string;
};

type AliasSaveStatus = {
  state: "idle" | "saving" | "saved" | "error";
  message?: string;
};

type NotesState = {
  state: "idle" | "loading" | "ready" | "saving" | "error";
  notes: MemberNote[];
  overview: MemberMemoryOverview | null;
  error?: string;
};

const normalize = (value: string) => value.toLowerCase().trim();

const cleanAliases = (aliases: string[]) =>
  Array.from(new Set(aliases.map((alias) => alias.trim()).filter(Boolean)));

const sameAliases = (left: string[], right: string[]) =>
  left.length === right.length && left.every((alias, index) => alias === right[index]);

const parseJsonResponse = async (response: Response) => {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(response.ok ? "Server returned invalid JSON" : "Server returned an error page");
  }
};

const matchesMember = (member: MemberSeed, query: string) => {
  if (!query) return true;
  return [
    member.name,
    member.related_organization,
    member.email,
    member.linkedin,
    ...member.aliases
  ].some((value) => value && normalize(value).includes(query));
};

export function MemberExplorer({ members, initialSelectedId }: MemberExplorerProps) {
  const [editableMembers, setEditableMembers] = useState(members);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(() => {
    const hasInitialSelected = members.some(
      (member) => member.airtable_id === initialSelectedId
    );
    return hasInitialSelected ? initialSelectedId! : members[0]?.airtable_id ?? "";
  });
  const [draftAlias, setDraftAlias] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [aliasSaveStatus, setAliasSaveStatus] = useState<Record<string, AliasSaveStatus>>({});
  const [notesByMember, setNotesByMember] = useState<Record<string, NotesState>>({});
  const [openNoteIds, setOpenNoteIds] = useState<Record<string, boolean>>({});
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [isConfirmingNoteDelete, setIsConfirmingNoteDelete] = useState(false);
  const [isDeletingNotes, setIsDeletingNotes] = useState(false);

  const filteredMembers = useMemo(() => {
    const normalizedQuery = normalize(query);
    return editableMembers.filter((member) => matchesMember(member, normalizedQuery));
  }, [editableMembers, query]);

  const selected =
    editableMembers.find((member) => member.airtable_id === selectedId) ??
    filteredMembers[0] ??
    editableMembers[0];

  useEffect(() => {
    setDraftAlias("");
    setDraftNote("");
    setSelectedNoteIds([]);
    setIsConfirmingNoteDelete(false);
    setIsDeletingNotes(false);
  }, [selectedId]);

  useEffect(() => {
    if (!query || filteredMembers.length === 0) return;
    if (filteredMembers.some((member) => member.airtable_id === selectedId)) return;
    setSelectedId(filteredMembers[0].airtable_id);
  }, [filteredMembers, query, selectedId]);

  useEffect(() => {
    if (!selected || notesByMember[selected.airtable_id]) return;

    setNotesByMember((current) => ({
      ...current,
      [selected.airtable_id]: { state: "loading", notes: [], overview: null }
    }));

    fetch(`/api/members/${encodeURIComponent(selected.airtable_id)}/notes`)
      .then(async (response) => {
        const payload = await parseJsonResponse(response);
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load notes");
        }
        setNotesByMember((current) => ({
          ...current,
          [selected.airtable_id]: { state: "ready", notes: payload.notes, overview: payload.overview }
        }));
      })
      .catch((error) => {
        setNotesByMember((current) => ({
          ...current,
          [selected.airtable_id]: {
            state: "error",
            notes: [],
            overview: null,
            error: error instanceof Error ? error.message : "Failed to load notes"
          }
        }));
      });
  }, [notesByMember, selected]);

  const updateMemberAliases = (airtableId: string, aliases: string[]) => {
    setEditableMembers((currentMembers) =>
      currentMembers.map((member) =>
        member.airtable_id === airtableId ? { ...member, aliases } : member
      )
    );
  };

  const persistMemberAliases = async (airtableId: string, nextAliases: string[]) => {
    const member = editableMembers.find(
      (currentMember) => currentMember.airtable_id === airtableId
    );
    if (!member) return;

    const previousAliases = member.aliases;
    const cleanedAliases = cleanAliases(nextAliases);

    if (sameAliases(previousAliases, cleanedAliases)) {
      return;
    }

    updateMemberAliases(airtableId, cleanedAliases);
    setAliasSaveStatus((current) => ({
      ...current,
      [airtableId]: { state: "saving" }
    }));

    try {
      const response = await fetch(`/api/members/${encodeURIComponent(airtableId)}/aliases`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ aliases: cleanedAliases })
      });

      const payload = (await parseJsonResponse(response)) as {
        member?: MemberSeed;
        error?: string;
      };

      if (!response.ok || !payload.member) {
        throw new Error(payload.error ?? "Failed to save aliases");
      }

      setEditableMembers((currentMembers) =>
        currentMembers.map((currentMember) =>
          currentMember.airtable_id === airtableId
            ? { ...currentMember, ...payload.member }
            : currentMember
        )
      );
      setAliasSaveStatus((current) => ({
        ...current,
        [airtableId]: { state: "saved", message: "Saved" }
      }));
    } catch (error) {
      updateMemberAliases(airtableId, previousAliases);
      setAliasSaveStatus((current) => ({
        ...current,
        [airtableId]: {
          state: "error",
          message: error instanceof Error ? error.message : "Failed to save aliases"
        }
      }));
    }
  };

  const addAlias = () => {
    if (!selected) return;
    void persistMemberAliases(selected.airtable_id, [...selected.aliases, draftAlias]);
    setDraftAlias("");
  };

  const renameAlias = (oldAlias: string, nextAlias: string) => {
    if (!selected) return;
    void persistMemberAliases(
      selected.airtable_id,
      selected.aliases.map((alias) => (alias === oldAlias ? nextAlias : alias))
    );
  };

  const removeAlias = (aliasToRemove: string) => {
    if (!selected) return;
    void persistMemberAliases(
      selected.airtable_id,
      selected.aliases.filter((alias) => alias !== aliasToRemove)
    );
  };

  const selectedAliasSaveStatus = selected
    ? aliasSaveStatus[selected.airtable_id] ?? { state: "idle" }
    : ({ state: "idle" } satisfies AliasSaveStatus);
  const selectedNotesState = selected
    ? notesByMember[selected.airtable_id] ?? { state: "idle", notes: [], overview: null }
    : ({ state: "idle", notes: [], overview: null } satisfies NotesState);

  const addNote = async () => {
    if (!selected || !draftNote.trim()) return;

    const noteText = draftNote.trim();
    setDraftNote("");
    setNotesByMember((current) => ({
      ...current,
      [selected.airtable_id]: {
        ...(current[selected.airtable_id] ?? { notes: [], overview: null }),
        state: "saving"
      }
    }));

    try {
      const response = await fetch(`/api/members/${encodeURIComponent(selected.airtable_id)}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ note_text: noteText })
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save note");
      }
      setNotesByMember((current) => ({
        ...current,
        [selected.airtable_id]: {
          state: "ready",
          notes: payload.notes,
          overview: payload.overview
        }
      }));
    } catch (error) {
      setDraftNote(noteText);
      setNotesByMember((current) => ({
        ...current,
        [selected.airtable_id]: {
          ...(current[selected.airtable_id] ?? { notes: [], overview: null }),
          state: "error",
          error: error instanceof Error ? error.message : "Failed to save note"
        }
      }));
    }
  };

  const toggleNoteSelection = (noteId: string) => {
    setSelectedNoteIds((current) =>
      current.includes(noteId)
        ? current.filter((selectedNoteId) => selectedNoteId !== noteId)
        : [...current, noteId]
    );
    setIsConfirmingNoteDelete(false);
  };

  const selectAllNotes = () => {
    setSelectedNoteIds(selectedNotesState.notes.map((note) => note.id));
    setIsConfirmingNoteDelete(false);
  };

  const clearSelectedNotes = () => {
    setSelectedNoteIds([]);
    setIsConfirmingNoteDelete(false);
  };

  const deleteSelectedNotes = async () => {
    if (!selected || selectedNoteIds.length === 0) return;

    const noteIdsToDelete = [...selectedNoteIds];
    setIsDeletingNotes(true);
    setNotesByMember((current) => ({
      ...current,
      [selected.airtable_id]: {
        ...(current[selected.airtable_id] ?? { notes: [], overview: null }),
        state: "saving"
      }
    }));

    try {
      const response = await fetch(`/api/members/${encodeURIComponent(selected.airtable_id)}/notes`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ note_ids: noteIdsToDelete })
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete selected notes");
      }

      setOpenNoteIds((current) => {
        const nextOpenNoteIds = { ...current };
        for (const noteId of noteIdsToDelete) {
          delete nextOpenNoteIds[noteId];
        }
        return nextOpenNoteIds;
      });
      setNotesByMember((current) => ({
        ...current,
        [selected.airtable_id]: {
          state: "ready",
          notes: payload.notes,
          overview: payload.overview
        }
      }));
      setSelectedNoteIds([]);
      setIsConfirmingNoteDelete(false);
    } catch (error) {
      setNotesByMember((current) => ({
        ...current,
        [selected.airtable_id]: {
          ...(current[selected.airtable_id] ?? { notes: [], overview: null }),
          state: "error",
          error: error instanceof Error ? error.message : "Failed to delete selected notes"
        }
      }));
    } finally {
      setIsDeletingNotes(false);
    }
  };

  const formatNoteDate = (isoDate: string) =>
    new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(new Date(isoDate));

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Desktop search</p>
          <h1>Member memory</h1>
        </div>
      </header>

      <div className="content-grid">
        <section className="result-list" aria-label="Member results">
          <label className="search-form list-search">
            <Search size={18} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search members, orgs, aliases"
              aria-label="Search members"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")}>
                Clear
              </button>
            ) : (
              <span className="search-hint">Filter</span>
            )}
          </label>
          <div className="section-heading">
            <Building2 size={17} aria-hidden="true" />
            <span>{query ? `${filteredMembers.length} matches` : "Members"}</span>
          </div>
          {filteredMembers.map((member) => (
            <button
              className={`result-card ${selected?.airtable_id === member.airtable_id ? "selected" : ""}`}
              key={member.airtable_id}
              onClick={() => setSelectedId(member.airtable_id)}
              type="button"
            >
              <strong>{member.name}</strong>
              <span>{member.related_organization?.split(",").join(", ") || "Organization unknown"}</span>
            </button>
          ))}
          {!filteredMembers.length && (
            <p className="empty-state">No members match that search.</p>
          )}
        </section>

        <section className="profile-panel" aria-label="Member profile">
          {selected ? (
            <div className="profile-content" key={selected.airtable_id}>
              <div className="profile-header">
                <div>
                  <p className="eyebrow">Member profile</p>
                  <h2>{selected.name}</h2>
                  <p>{selected.related_organization || "No organization in snapshot"}</p>
                </div>
              </div>

              <div className="profile-block">
                <div className="block-heading-row">
                  <h3>Member vocabulary</h3>
                  {selectedAliasSaveStatus.state !== "idle" && (
                    <span className={`save-indicator ${selectedAliasSaveStatus.state}`}>
                      {selectedAliasSaveStatus.state === "saving"
                        ? "Saving"
                        : selectedAliasSaveStatus.state === "error"
                          ? "Save failed"
                          : selectedAliasSaveStatus.message}
                    </span>
                  )}
                </div>
                <div className="editable-vocabulary">
                  {selected.aliases.map((alias) => (
                    <div className="alias-row" key={alias}>
                      <input
                        aria-label={`Edit alias ${alias}`}
                        defaultValue={alias}
                        style={{ width: `${Math.max(alias.length + 1, 5)}ch` }}
                        onBlur={(event) => renameAlias(alias, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }
                        }}
                      />
                      <button
                        aria-label={`Remove alias ${alias}`}
                        className="icon-button"
                        onClick={() => removeAlias(alias)}
                        type="button"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <form
                    className="alias-add-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      addAlias();
                    }}
                  >
                    <input
                      aria-label="New vocabulary term"
                      placeholder="Add term"
                      value={draftAlias}
                      onChange={(event) => setDraftAlias(event.target.value)}
                      style={{ width: `${Math.max(draftAlias.length + 4, 9)}ch` }}
                    />
                    <button className="icon-button add-icon-button" aria-label="Add vocabulary term" type="submit">
                      <Plus size={15} aria-hidden="true" />
                    </button>
                  </form>
                </div>
              </div>

              <div className="profile-block memory-block">
                <div className="block-heading-row">
                  <h3>Memory overview</h3>
                  {selectedNotesState.overview?.overview_json.sentiment_label && (
                    <span className={`sentiment-pill ${selectedNotesState.overview.overview_json.sentiment_label}`}>
                      {selectedNotesState.overview.overview_json.sentiment_label}
                    </span>
                  )}
                </div>
                <div className="memory-summary">
                  {selectedNotesState.state === "loading" || selectedNotesState.state === "idle" ? (
                    <p className="empty-state">Loading notes.</p>
                  ) : selectedNotesState.overview ? (
                    <>
                      <div className="overview-grid">
                        <div>
                          <h4>Primary interests</h4>
                          {selectedNotesState.overview.overview_json.primary_interests.length > 0 ? (
                            <div className="interest-tags">
                              {selectedNotesState.overview.overview_json.primary_interests.map((interest) => (
                                <span key={interest}>{interest}</span>
                              ))}
                            </div>
                          ) : (
                            <p className="empty-state">Still emerging.</p>
                          )}
                        </div>
                        <div>
                          <h4>Evaluation lens</h4>
                          {selectedNotesState.overview.overview_json.evaluation_lens.length > 0 ? (
                            <ul>
                              {selectedNotesState.overview.overview_json.evaluation_lens.map((signal) => (
                                <li key={signal}>{signal}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="empty-state">Add more notes to build this.</p>
                          )}
                        </div>
                        {selectedNotesState.overview.overview_json.cautions.length > 0 && (
                          <div>
                            <h4>Cautions</h4>
                            <ul>
                              {selectedNotesState.overview.overview_json.cautions.map((caution) => (
                                <li key={caution}>{caution}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {selectedNotesState.overview.overview_json.recent_signals.length > 0 && (
                          <div>
                            <h4>Recent signals</h4>
                            <ul>
                              {selectedNotesState.overview.overview_json.recent_signals.map((signal) => (
                                <li key={`${signal.date}-${signal.text}`}>
                                  <strong>{signal.date}</strong>
                                  <span>{signal.text}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      <div className="summary-meta">
                        <span>{selectedNotesState.overview.note_count} notes</span>
                        {selectedNotesState.overview.last_note_at && (
                          <span>Last note {formatNoteDate(selectedNotesState.overview.last_note_at)}</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="empty-state">
                      No notes yet. Add what this member likes, avoids, or asks about.
                    </p>
                  )}
                </div>

                <form
                  className="note-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addNote();
                  }}
                >
                  <textarea
                    aria-label="Add member note"
                    placeholder="Add a note about interests, patterns, objections, or thesis..."
                    value={draftNote}
                    onChange={(event) => setDraftNote(event.target.value)}
                  />
                  <button disabled={!draftNote.trim() || selectedNotesState.state === "saving"} type="submit">
                    <Send size={15} aria-hidden="true" />
                    {selectedNotesState.state === "saving" ? "Saving" : "Send"}
                  </button>
                </form>
                {selectedNotesState.state === "error" && (
                  <p className="inline-error">{selectedNotesState.error ?? "Failed to save note"}</p>
                )}
              </div>

              <div className="profile-block">
                <div className="notes-log-header">
                  <h3>Notes log</h3>
                  {selectedNotesState.notes.length > 0 && (
                    <div className="notes-log-actions">
                      {selectedNoteIds.length > 0 ? (
                        <>
                          <span>{selectedNoteIds.length} selected</span>
                          {isConfirmingNoteDelete ? (
                            <>
                              <button
                                className="note-delete-confirm"
                                disabled={isDeletingNotes}
                                onClick={() => void deleteSelectedNotes()}
                                type="button"
                              >
                                {isDeletingNotes ? "Deleting" : "Delete selected"}
                              </button>
                              <button
                                className="note-delete-cancel"
                                disabled={isDeletingNotes}
                                onClick={() => setIsConfirmingNoteDelete(false)}
                                type="button"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              className="note-delete-selected"
                              disabled={selectedNotesState.state === "saving"}
                              onClick={() => setIsConfirmingNoteDelete(true)}
                              type="button"
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              Delete
                            </button>
                          )}
                          <button
                            className="note-clear-selection"
                            disabled={isDeletingNotes}
                            onClick={clearSelectedNotes}
                            type="button"
                          >
                            Clear
                          </button>
                        </>
                      ) : (
                        <button className="note-clear-selection" onClick={selectAllNotes} type="button">
                          Select all
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {selectedNotesState.notes.length > 0 ? (
                  <div className="notes-log">
                    {selectedNotesState.notes.map((note) => {
                      const isOpen = Boolean(openNoteIds[note.id]);
                      const isSelected = selectedNoteIds.includes(note.id);
                      return (
                        <div className={`note-log-row ${isSelected ? "selected" : ""}`} key={note.id}>
                          <button
                            aria-label={`${isSelected ? "Deselect" : "Select"} ${note.source} note from ${formatNoteDate(
                              note.occurred_at
                            )}`}
                            className="note-select-button"
                            disabled={selectedNotesState.state === "saving"}
                            onClick={() => toggleNoteSelection(note.id)}
                            type="button"
                          >
                            {isSelected ? (
                              <CheckSquare size={16} aria-hidden="true" />
                            ) : (
                              <Square size={16} aria-hidden="true" />
                            )}
                          </button>
                          <span className="note-source" title={`${note.source} note`}>
                            {note.source === "voice" ? (
                              <Mic2 size={15} aria-hidden="true" />
                            ) : (
                              <StickyNote size={15} aria-hidden="true" />
                            )}
                          </span>
                          <span className="note-date">{formatNoteDate(note.occurred_at)}</span>
                          <button
                            className="note-expand-button"
                            onClick={() =>
                              setOpenNoteIds((current) => ({
                                ...current,
                                [note.id]: !current[note.id]
                              }))
                            }
                            type="button"
                          >
                            <span className="note-preview">
                              {isOpen ? note.note_text : note.note_text.slice(0, 140)}
                            </span>
                            {isOpen ? (
                              <ChevronDown size={15} aria-hidden="true" />
                            ) : (
                              <ChevronRight size={15} aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="empty-state">No note history yet.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="empty-state">No member found.</p>
          )}
        </section>
      </div>
    </>
  );
}
