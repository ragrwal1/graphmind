"use client";

export type SavedNote = {
  name: string;
  airtableId: string;
};

type Props = {
  notes: SavedNote[];
  onReset: () => void;
};

export function MobileCaptureResult({ notes, onReset }: Props) {
  return (
    <div className="mobile-result-content">
      <div className="mobile-result-cards">
        {notes.map((note, i) => (
          <button
            key={note.airtableId}
            className="mobile-result-card"
            style={{ animationDelay: `${i * 90}ms` }}
            onClick={() => {
              // TODO: navigate to mobile member profile for note.airtableId
              // once mobile search + profile view is implemented, replace this
              // with: router.push(`/mobile/member/${note.airtableId}`)
            }}
          >
            <span className="mobile-result-name">{note.name}</span>
            <span className="mobile-result-badge">+ note added</span>
          </button>
        ))}
      </div>
      <button className="mobile-result-reset" onClick={onReset}>
        record again
      </button>
    </div>
  );
}
