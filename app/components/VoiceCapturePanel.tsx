"use client";

import { useEffect, useRef, useState } from "react";
import { Mic2, Square } from "lucide-react";

type CaptureState =
  | "idle"
  | "recording"
  | "transcribing"
  | "extracting"
  | "saving"
  | "complete"
  | "error";

type VoiceUpdate = {
  spoken_name: string;
  airtable_id: string | null;
  matched_name: string | null;
  detail: string;
  confidence: "high" | "medium" | "low";
};

type TranscribeResponse = {
  capture_id: string;
  transcript: string;
  member_vocabulary_count: number;
  error?: string;
};

type ExtractResponse = {
  updates: VoiceUpdate[];
  error?: string;
};

type CommitResponse = {
  saved: Array<{
    airtable_id: string;
    source: "voice";
  }>;
  error?: string;
};

type CaptureResult = TranscribeResponse &
  ExtractResponse &
  CommitResponse;

const MAX_RECORDING_SECONDS = 45;

const parseJsonResponse = async <Payload,>(response: Response) => {
  const text = await response.text();
  try {
    return (text ? JSON.parse(text) : {}) as Payload;
  } catch {
    throw new Error(response.ok ? "Server returned invalid JSON" : "Server returned an error page");
  }
};

export function VoiceCapturePanel() {
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [remainingSeconds, setRemainingSeconds] = useState(MAX_RECORDING_SECONDS);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const countdownRef = useRef<number | null>(null);
  const isBusy =
    captureState === "recording" ||
    captureState === "transcribing" ||
    captureState === "extracting" ||
    captureState === "saving";

  useEffect(
    () => () => {
      stopCountdown();
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    },
    []
  );

  const stopCountdown = () => {
    if (countdownRef.current) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  const stopRecording = () => {
    stopCountdown();
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  };

  const startRecording = async () => {
    if (isBusy) return;

    setResult(null);
    setError(null);
    setRemainingSeconds(MAX_RECORDING_SECONDS);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Safari on iOS supports audio/mp4; Chrome/Firefox support audio/webm
      const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
      const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });

      recorder.addEventListener("stop", async () => {
        stopCountdown();
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;

        try {
          const blobType = recorder.mimeType || mimeType || "audio/webm";
          const ext = blobType.includes("mp4") ? "mp4" : "webm";
          const audio = new Blob(chunks, { type: blobType });
          const audioFile = new File([audio], `capture.${ext}`, { type: audio.type });
          const transcribeForm = new FormData();
          transcribeForm.append("audio", audioFile);

          setCaptureState("transcribing");
          const transcribeResponse = await fetch("/api/capture/transcribe", {
            method: "POST",
            body: transcribeForm
          });
          const transcription = await parseJsonResponse<TranscribeResponse>(transcribeResponse);

          if (!transcribeResponse.ok) {
            throw new Error(transcription.error ?? "Failed to transcribe recording");
          }

          setResult({
            ...transcription,
            updates: [],
            saved: []
          });

          setCaptureState("extracting");
          const extractResponse = await fetch("/api/capture/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              capture_id: transcription.capture_id,
              transcript: transcription.transcript
            })
          });
          const extraction = await parseJsonResponse<ExtractResponse>(extractResponse);

          if (!extractResponse.ok) {
            throw new Error(extraction.error ?? "Failed to extract member updates");
          }

          setResult({
            ...transcription,
            ...extraction,
            saved: []
          });

          setCaptureState("saving");
          const commitResponse = await fetch("/api/capture/commit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              capture_id: transcription.capture_id,
              updates: extraction.updates
            })
          });
          const commit = await parseJsonResponse<CommitResponse>(commitResponse);

          if (!commitResponse.ok) {
            throw new Error(commit.error ?? "Failed to save member notes");
          }

          setResult({
            ...transcription,
            ...extraction,
            ...commit
          });
          setCaptureState("complete");
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : "Failed to process recording");
          setCaptureState("error");
        }
      });

      recorderRef.current = recorder;
      recorder.start();
      setCaptureState("recording");
      countdownRef.current = window.setInterval(() => {
        setRemainingSeconds((current) => {
          if (current <= 1) {
            stopRecording();
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not start recording");
      setCaptureState("error");
    }
  };

  const savedCount = result?.saved.length ?? 0;
  const savedIds = new Set(result?.saved.map((saved) => saved.airtable_id) ?? []);

  return (
    <div className="capture-layout">
      <section className="capture-recorder" aria-label="Voice capture">
        <div className={`capture-timer ${captureState === "recording" ? "active" : ""}`}>
          <span>{remainingSeconds}</span>
          <small>seconds</small>
        </div>
        <div className="capture-actions">
          <button
            className="capture-record-button"
            disabled={isBusy}
            onClick={() => void startRecording()}
            type="button"
          >
            <Mic2 size={18} aria-hidden="true" />
            Record
          </button>
          <button
            className="capture-stop-button"
            disabled={captureState !== "recording"}
            onClick={stopRecording}
            type="button"
          >
            <Square size={16} aria-hidden="true" />
            Stop
          </button>
        </div>
        <p className={`capture-status ${captureState}`}>
          {captureState === "recording"
            ? "Recording. Mention one or more members."
            : captureState === "transcribing"
              ? "Transcribing with member vocabulary."
              : captureState === "extracting"
                ? "Extracting member updates."
                : captureState === "saving"
                  ? "Saving notes."
              : captureState === "complete"
                ? `Saved ${savedCount} note${savedCount === 1 ? "" : "s"}.`
                : captureState === "error"
                  ? error
                  : "Ready for a 45 second voice capture."}
        </p>
      </section>

      <section className="capture-results" aria-label="Capture results">
        <h2>Extraction</h2>
        {result ? (
          <>
            <div className="capture-transcript">
              <h3>Transcript</h3>
              <p>{result.transcript}</p>
            </div>
            <div className="capture-update-list">
              {result.updates.map((update, index) => (
                <article className="capture-update" key={`${update.spoken_name}-${index}`}>
                  <div>
                    <strong>{update.matched_name ?? update.spoken_name}</strong>
                    <span>{update.airtable_id ?? "No member match"}</span>
                  </div>
                  <p>{update.detail}</p>
                  <small>
                    {update.airtable_id
                      ? savedIds.has(update.airtable_id)
                        ? "Saved as voice note"
                        : captureState === "saving"
                          ? "Saving"
                          : "Pending save"
                      : "Unmatched, not saved"}{" "}
                    · {update.confidence} confidence
                  </small>
                </article>
              ))}
            </div>
            <pre className="voice-json">
              {JSON.stringify(
                {
                  capture_id: result.capture_id,
                  transcript: result.transcript,
                  updates: result.updates,
                  saved: result.saved
                },
                null,
                2
              )}
            </pre>
          </>
        ) : (
          <p className="empty-state">
            Say something like: Rohan is now into cars and Abhi really likes energy.
          </p>
        )}
      </section>
    </div>
  );
}
