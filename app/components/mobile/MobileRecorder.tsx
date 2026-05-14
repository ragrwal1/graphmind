"use client";

import { Mic } from "lucide-react";

type Props = {
  recording: boolean;
  remaining: number;
  processing: boolean;
  statusText: string | null;
  isError?: boolean;
  onToggle: () => void;
};

export function MobileRecorder({ recording, remaining, processing, statusText, isError, onToggle }: Props) {
  return (
    <div className="mobile-recorder-content">
      <button
        className={`mobile-record-btn ${recording ? "recording" : ""} ${processing ? "processing" : ""}`}
        onClick={onToggle}
        disabled={processing}
        aria-label={recording ? "Stop recording" : "Start recording"}
      >
        {recording ? (
          <span className="mobile-countdown">{remaining}</span>
        ) : processing ? (
          <span className="mobile-record-spinner" />
        ) : (
          <Mic size={32} strokeWidth={1.5} />
        )}
      </button>
      {recording && <p className="mobile-stop-hint">press again to stop</p>}
      {statusText && !recording && (
        <p className={`mobile-status-text ${isError ? "error" : ""}`}>{statusText}</p>
      )}
    </div>
  );
}
