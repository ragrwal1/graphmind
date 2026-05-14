"use client";

import { useEffect, useRef, useState } from "react";
import { MobileRecorder } from "./MobileRecorder";
import { MobileSearch } from "./MobileSearch";
import { MobileCaptureResult, type SavedNote } from "./MobileCaptureResult";

const MAX_SECONDS = 45;

type PipelineState =
  | "idle"
  | "recording"
  | "transcribing"
  | "extracting"
  | "saving"
  | "complete"
  | "error";

type TranscribeResponse = { capture_id: string; transcript: string; error?: string };
type Update = { spoken_name: string; matched_name: string | null; airtable_id: string | null };
type ExtractResponse = { updates: Update[]; error?: string };
type CommitResponse = { saved: { airtable_id: string }[]; error?: string };

function getSupportedMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
  for (const type of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

const parseJson = async <T,>(res: Response): Promise<T> => {
  const text = await res.text();
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new Error(res.ok ? "Invalid JSON from server" : "Server error");
  }
};

export function MobileHome() {
  const [state, setState] = useState<PipelineState>("idle");
  const [remaining, setRemaining] = useState(MAX_SECONDS);
  const [searchOpen, setSearchOpen] = useState(false);
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isBusy =
    state === "recording" ||
    state === "transcribing" ||
    state === "extracting" ||
    state === "saving";

  useEffect(
    () => () => {
      stopCountdown();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    },
    []
  );

  const stopCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  const handleReset = () => {
    setSavedNotes([]);
    setErrorMsg(null);
    setState("idle");
  };

  const handleToggle = async () => {
    if (state === "recording") {
      stopCountdown();
      recorderRef.current?.stop();
      return;
    }

    if (isBusy) return;

    setSavedNotes([]);
    setErrorMsg(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.addEventListener("dataavailable", (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      });

      recorder.addEventListener("stop", async () => {
        stopCountdown();
        stream.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;

        try {
          const blobType = recorder.mimeType || mimeType || "audio/webm";
          const ext = blobType.includes("mp4") ? "mp4" : "webm";
          const audio = new Blob(chunks, { type: blobType });
          const audioFile = new File([audio], `capture.${ext}`, { type: audio.type });

          const transcribeForm = new FormData();
          transcribeForm.append("audio", audioFile);

          setState("transcribing");
          const transcribeRes = await fetch("/api/capture/transcribe", {
            method: "POST",
            body: transcribeForm,
          });
          const transcription = await parseJson<TranscribeResponse>(transcribeRes);
          if (!transcribeRes.ok) throw new Error(transcription.error ?? "Transcription failed");

          setState("extracting");
          const extractRes = await fetch("/api/capture/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              capture_id: transcription.capture_id,
              transcript: transcription.transcript,
            }),
          });
          const extraction = await parseJson<ExtractResponse>(extractRes);
          if (!extractRes.ok) throw new Error(extraction.error ?? "Extraction failed");

          setState("saving");
          const commitRes = await fetch("/api/capture/commit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              capture_id: transcription.capture_id,
              updates: extraction.updates,
            }),
          });
          const commit = await parseJson<CommitResponse>(commitRes);
          if (!commitRes.ok) throw new Error(commit.error ?? "Save failed");

          // Build result cards: match saved airtable_ids back to extracted names
          const savedIds = new Set(commit.saved.map((s) => s.airtable_id));
          const notes: SavedNote[] = extraction.updates
            .filter((u) => u.airtable_id && savedIds.has(u.airtable_id))
            .map((u) => ({
              name: u.matched_name ?? u.spoken_name,
              airtableId: u.airtable_id!,
            }));

          setSavedNotes(notes);
          setState("complete");
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
          setState("error");
        }
      });

      recorderRef.current = recorder;
      recorder.start();
      setState("recording");
      setRemaining(MAX_SECONDS);

      countdownRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            stopCountdown();
            recorder.stop();
            return MAX_SECONDS;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not start recording");
      setState("error");
    }
  };

  const statusText =
    state === "transcribing"
      ? "Transcribing…"
      : state === "extracting"
        ? "Extracting updates…"
        : state === "saving"
          ? "Saving notes…"
          : state === "error"
            ? (errorMsg ?? "Error")
            : null;

  return (
    <>
      <div className="mobile-home">
        <div className="mobile-logo">
          <img src="/realmspark-logo.svg" alt="RealmSpark" />
        </div>
        <div className="mobile-panel mobile-recorder-panel">
          {state === "complete" ? (
            <MobileCaptureResult notes={savedNotes} onReset={handleReset} />
          ) : (
            <MobileRecorder
              recording={state === "recording"}
              remaining={remaining}
              processing={isBusy && state !== "recording"}
              statusText={statusText}
              isError={state === "error"}
              onToggle={handleToggle}
            />
          )}
        </div>
        <button
          className="mobile-panel mobile-search-panel"
          onClick={() => setSearchOpen(true)}
          aria-label="Open search"
        >
          <MobileSearch trigger />
        </button>
      </div>
      {searchOpen && <MobileSearch expanded onClose={() => setSearchOpen(false)} />}
    </>
  );
}
