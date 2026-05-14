const recordButton = document.querySelector("#recordButton");
const stopButton = document.querySelector("#stopButton");
const statusEl = document.querySelector("#status");
const outputEl = document.querySelector("#output");

let recorder;
let chunks = [];

function setStatus(message) {
  statusEl.textContent = message;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

recordButton.addEventListener("click", async () => {
  chunks = [];
  outputEl.textContent = "{}";

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recorder = new MediaRecorder(stream);

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  recorder.addEventListener("stop", async () => {
    stream.getTracks().forEach((track) => track.stop());
    recordButton.disabled = false;
    stopButton.disabled = true;
    setStatus("Processing...");

    try {
      const audio = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const audioBase64 = await blobToBase64(audio);
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64,
          mimeType: audio.type,
          filename: "speech.webm"
        })
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Processing failed");

      outputEl.textContent = JSON.stringify(payload.extracted, null, 2);
      const count = payload.extracted?.updates?.length ?? 0;
      setStatus(`Transcript: ${payload.transcript} (${count} matched update${count === 1 ? "" : "s"})`);
    } catch (error) {
      outputEl.textContent = JSON.stringify({ error: error.message }, null, 2);
      setStatus("Failed.");
    }
  });

  recorder.start();
  recordButton.disabled = true;
  stopButton.disabled = false;
  setStatus("Recording...");
});

stopButton.addEventListener("click", () => {
  if (recorder?.state === "recording") recorder.stop();
});
