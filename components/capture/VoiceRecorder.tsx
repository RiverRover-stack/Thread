"use client";

import { useEffect, useRef, useState } from "react";

type Status = "idle" | "requesting" | "recording" | "stopping" | "transcribing";
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
  const [status, setStatus] = useState<Status>("idle");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const transcriptionRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (status !== "recording") return;

    const timer = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    return () => {
      // Invalidate permission requests that might resolve after navigation.
      requestIdRef.current += 1;
      transcriptionRef.current?.abort();
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

  async function requestTranscript(blob: Blob) {
    if (transcriptionRef.current) return;
    const controller = new AbortController();
    transcriptionRef.current = controller;
    busyRef.current = true;
    setStatus("transcribing");
    setError(null);
    setTranscript(null);

    try {
      const form = new FormData();
      const mimeType = blob.type.split(";")[0];
      const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("webm") ? "webm" : "audio";
      form.append("audio", blob, `thought.${extension}`);
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(75_000)]),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
          ? result.error : "Transcription failed. Please retry.";
        throw new Error(message);
      }
      if (!result || typeof result !== "object" || !("transcript" in result) || typeof result.transcript !== "string" || !result.transcript.trim()) {
        throw new Error("The server returned an invalid transcript. Please retry.");
      }
      if (!controller.signal.aborted) setTranscript(result.transcript);
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error && error.name === "TimeoutError"
          ? "Transcription took too long. Your recording is still available; please retry."
          : error instanceof TypeError || error instanceof SyntaxError
            ? "Could not get a valid response from Thread. Check the app is running, then retry."
          : error instanceof Error ? error.message : "Transcription failed. Please retry.");
      }
    } finally {
      if (!controller.signal.aborted) {
        transcriptionRef.current = null;
        busyRef.current = false;
        setStatus("idle");
      }
    }
  }

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
        void requestTranscript(blob);
      };

      recorder.start();
      setElapsedSeconds(0);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setRecording(null);
      setTranscript(null);
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
    idle: transcript ? "Transcript ready. Review what you said below." : recording ? "Audio captured. Play it back below or retry transcription." : "Ready when you are.",
    requesting: "Waiting for microphone permission. Check your browser's permission prompt.",
    recording: "Recording. Speak your thought, then press Stop recording.",
    stopping: "Finishing your recording…",
    transcribing: "Transcribing your thought…",
  }[status];
  const elapsedTime = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  return (
    <section aria-labelledby="capture-heading" className="mt-10 rounded-2xl border border-stone-300 bg-white p-6 sm:p-8">
      <h2 id="capture-heading" className="text-xl font-semibold">Capture a thought</h2>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">
        When you stop recording, your audio is sent to ElevenLabs for transcription.
        Thread doesn&apos;t save your audio or transcript yet; refreshing clears them.
      </p>
      <div className="mt-6">
        <button
          type="button"
          onClick={status === "recording" ? stopRecording : startRecording}
          disabled={status === "requesting" || status === "stopping" || status === "transcribing"}
          className="min-h-12 rounded-full bg-emerald-900 px-6 py-3 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800 disabled:cursor-wait disabled:opacity-60"
        >
          {status === "recording" ? "Stop recording" : status === "requesting" ? "Requesting microphone…" : status === "stopping" ? "Finishing…" : status === "transcribing" ? "Transcribing…" : recording ? "Record again" : "Record a thought"}
        </button>
      </div>
      <p role="status" className="mt-4 text-sm leading-relaxed text-stone-700">
        {status === "recording" && <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-red-600" />}
        {statusText}{(status === "recording" || status === "stopping") && <span className="ml-2 font-mono tabular-nums">{elapsedTime}</span>}
      </p>
      {error && <p role="alert" className="mt-4 text-sm leading-relaxed text-red-800">{error}</p>}
      {recording && !transcript && status === "idle" && (
        <button type="button" onClick={() => void requestTranscript(recording.blob)} className="mt-4 rounded px-2 py-1 font-semibold text-emerald-900 underline focus-visible:outline-2 focus-visible:outline-offset-2">
          Retry transcription
        </button>
      )}
      {/* CHALLENGE: Add a Copy transcript button without changing the transcript.
          TODO(you): Use the clipboard API; show success only after it resolves.
          Verify: Paste elsewhere and compare punctuation and line breaks. */}
      {transcript && (
        <section aria-labelledby="transcript-heading" className="mt-6 border-t border-stone-200 pt-6">
          <h3 id="transcript-heading" className="text-sm font-semibold tracking-wide">USER SAID · TRANSCRIPT</h3>
          <p className="mt-3 whitespace-pre-wrap leading-relaxed">{transcript}</p>
        </section>
      )}
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
