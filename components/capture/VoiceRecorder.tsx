"use client";

import { useEffect, useRef, useState } from "react";

type Status = "idle" | "requesting" | "recording" | "stopping";
type Recording = { blob: Blob; url: string };

function microphoneError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Microphone access was blocked. Allow it in your browser's site settings, then try again.";
      case "NotFoundError":
        return "No microphone was found. Connect one and try again.";
      case "NotReadableError":
        return "Your microphone could not be opened. Check whether another app is using it, then try again.";
    }
  }
  return "Recording could not start. Check your microphone and try again.";
}

export default function VoiceRecorder() {
  // CHALLENGE: Display elapsed recording time without changing the audio data.
  // TODO(you): Reset on start; clear the timer on stop and unmount.
  // Verify: Record twice. The second recording must start at zero.
  const [status, setStatus] = useState<Status>("idle");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      // Invalidate permission requests that might resolve after navigation.
      requestIdRef.current += 1;
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  async function startRecording() {
    // A ref blocks rapid repeat clicks before React updates the button.
    if (busyRef.current) return;
    setError(null);

    if (!window.isSecureContext) {
      setError("Microphone recording requires HTTPS or localhost. Open the app on localhost during development.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser does not support audio recording. Try a current version of Chrome, Edge, Firefox, or Safari.");
      return;
    }

    busyRef.current = true;
    setStatus("requesting");
    const requestId = ++requestIdRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (requestId !== requestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      // Let the browser choose an encoding it can actually record and play.
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      let failed = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        failed = true;
        setError("Recording was interrupted. Please try recording again.");
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        busyRef.current = false;
        setStatus("idle");

        if (failed) return;
        // The final dataavailable event arrives before this stop event.
        const blob = new Blob(chunks, {
          type: recorder.mimeType || chunks[0]?.type || "",
        });
        if (blob.size === 0) {
          setError("No audio was captured. Try recording for a few seconds.");
          return;
        }
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setRecording({ blob, url });
      };

      recorder.start();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setRecording(null);
      setStatus("recording");
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      busyRef.current = false;
      setStatus("idle");
      setError(microphoneError(error));
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    setStatus("stopping");
    recorder.stop();
    // Stop the hardware tracks too; MediaRecorder.stop alone does not release them.
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }

  const statusText = {
    idle: recording ? "Audio captured. Play it back below." : "Ready when you are.",
    requesting: "Waiting for microphone permission. Check your browser's permission prompt.",
    recording: "Recording. Speak your thought, then press Stop recording.",
    stopping: "Finishing your recording…",
  }[status];

  return (
    <section aria-labelledby="capture-heading" className="mt-10 rounded-2xl border border-stone-300 bg-white p-6 sm:p-8">
      <h2 id="capture-heading" className="text-xl font-semibold">Capture a thought</h2>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">
        Your audio stays in this browser tab. It isn&apos;t uploaded or saved and will be lost when you leave or refresh.
      </p>
      <div className="mt-6">
        <button
          type="button"
          onClick={status === "recording" ? stopRecording : startRecording}
          disabled={status === "requesting" || status === "stopping"}
          className="min-h-12 rounded-full bg-emerald-900 px-6 py-3 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800 disabled:cursor-wait disabled:opacity-60"
        >
          {status === "recording" ? "Stop recording" : status === "requesting" ? "Requesting microphone…" : status === "stopping" ? "Finishing…" : recording ? "Record again" : "Record a thought"}
        </button>
      </div>
      <p role="status" className="mt-4 text-sm leading-relaxed text-stone-700">
        {status === "recording" && <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-red-600" />}
        {statusText}
      </p>
      {error && <p role="alert" className="mt-4 text-sm leading-relaxed text-red-800">{error}</p>}
      {recording && (
        <div className="mt-6 border-t border-stone-200 pt-6">
          <audio key={recording.url} controls src={recording.url} aria-label="Recorded thought playback" className="w-full" />
          <details className="mt-3 text-sm text-stone-600">
            <summary className="cursor-pointer">Recording details</summary>
            <p className="mt-2 break-words">Audio Blob: {recording.blob.size.toLocaleString()} bytes · {recording.blob.type || "Browser-selected audio format"}</p>
          </details>
        </div>
      )}
    </section>
  );
}
