"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { StructuredThought } from "@/lib/ai/schemas";

type Status = "idle" | "requesting" | "recording" | "stopping" | "transcribing" | "structuring" | "saving";
type Recording = { blob: Blob; url: string };

function isStructuredThought(value: unknown): value is StructuredThought {
  if (!value || typeof value !== "object") return false;
  const thought = value as Record<string, unknown>;
  return typeof thought.title === "string"
    && typeof thought.summary === "string"
    && Array.isArray(thought.categories)
    && thought.categories.every((category) => typeof category === "string")
    && typeof thought.actionable === "boolean"
    && (typeof thought.possibleAction === "string" || thought.possibleAction === null)
    && (typeof thought.questionToExplore === "string" || thought.questionToExplore === null);
}

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

export default function VoiceRecorder({ hostedInference = false, publicDemo = false }: { hostedInference?: boolean; publicDemo?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [structuredThought, setStructuredThought] = useState<StructuredThought | null>(null);
  const [savedThought, setSavedThought] = useState<{ id: string; createdAt: string } | null>(null);
  const [indexing, setIndexing] = useState<{ id: string; status: "loading" | "ready" | "error" } | null>(null);
  const indexingRef = useRef<AbortController | null>(null);
  const thoughtIdRef = useRef<string | null>(null);
  const savingRef = useRef<AbortController | null>(null);
  const transcriptionRef = useRef<AbortController | null>(null);
  const structuringRef = useRef<AbortController | null>(null);
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
    if (!publicDemo || status !== "recording") return;
    const timer = window.setTimeout(() => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state !== "recording") return;
      setStatus("stopping"); recorder.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
    }, 60_000);
    return () => window.clearTimeout(timer);
  }, [publicDemo, status]);

  useEffect(() => {
    return () => {
      // Invalidate permission requests that might resolve after navigation.
      requestIdRef.current += 1;
      transcriptionRef.current?.abort();
      structuringRef.current?.abort();
      savingRef.current?.abort();
      indexingRef.current?.abort();
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

  async function requestIndexing(id: string) {
    indexingRef.current?.abort();
    const controller = new AbortController();
    indexingRef.current = controller;
    setIndexing({ id, status: "loading" });
    try {
      const response = await fetch(`/api/thoughts/${id}/embedding`, {
        method: "POST", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(300_000)]),
      });
      const result = await response.json();
      if (!response.ok || result?.id !== id || result?.indexed !== true) throw new Error("Indexing failed");
      if (!controller.signal.aborted) setIndexing({ id, status: "ready" });
    } catch {
      if (!controller.signal.aborted) setIndexing({ id, status: "error" });
    } finally {
      if (indexingRef.current === controller) indexingRef.current = null;
    }
  }

  async function saveThought(rawTranscript: string, interpretation: StructuredThought) {
    if (savingRef.current || !thoughtIdRef.current) return;
    const controller = new AbortController();
    savingRef.current = controller;
    busyRef.current = true;
    setStatus("saving");
    setError(null);
    try {
      const response = await fetch("/api/thoughts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: thoughtIdRef.current, rawTranscript, structuredThought: interpretation }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "Saving failed. Please retry saving.");
      if (result?.thought?.id !== thoughtIdRef.current || typeof result?.thought?.createdAt !== "string") {
        throw new Error("The server returned an invalid save confirmation. Please retry saving.");
      }
      if (!controller.signal.aborted) {
        setSavedThought({ id: result.thought.id, createdAt: result.thought.createdAt });
        router.refresh();
        void requestIndexing(result.thought.id);
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error && error.name === "TimeoutError"
        ? "Save confirmation took too long. Retry saving; this will not create a duplicate."
        : error instanceof Error ? error.message : "Saving failed. Please retry saving.");
    } finally {
      if (!controller.signal.aborted) {
        savingRef.current = null;
        busyRef.current = false;
        setStatus("idle");
      }
    }
  }

  async function requestStructuredThought(rawTranscript: string) {
    if (structuringRef.current) return;
    const controller = new AbortController();
    structuringRef.current = controller;
    busyRef.current = true;
    setStatus("structuring");
    setError(null);
    setStructuredThought(null);

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: rawTranscript }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(195_000)]),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
          ? result.error : "AI processing failed. Please retry.";
        throw new Error(message);
      }
      if (!result || typeof result !== "object" || !("structuredThought" in result) || !isStructuredThought(result.structuredThought)) {
        throw new Error("The server returned an invalid structured thought. Please retry.");
      }
      if (!controller.signal.aborted) {
        setStructuredThought(result.structuredThought);
        await saveThought(rawTranscript, result.structuredThought);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error && error.name === "TimeoutError"
          ? "AI processing took too long. Please retry."
          : error instanceof TypeError || error instanceof SyntaxError
            ? "Could not get a valid response from Thread. Check your connection and retry."
            : error instanceof Error ? error.message : "AI processing failed. Please retry.");
      }
    } finally {
      if (!controller.signal.aborted) {
        structuringRef.current = null;
        busyRef.current = false;
        setStatus("idle");
      }
    }
  }

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
      if (!controller.signal.aborted) {
        setTranscript(result.transcript);
        transcriptionRef.current = null;
        await requestStructuredThought(result.transcript);
      }
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
        if (!structuringRef.current) {
          busyRef.current = false;
          setStatus("idle");
        }
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
      indexingRef.current?.abort();
      setIndexing(null);
      thoughtIdRef.current = crypto.randomUUID();
      setSavedThought(null);
      setElapsedSeconds(0);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setRecording(null);
      setTranscript(null);
      setStructuredThought(null);
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
    idle: savedThought ? "Your thought is saved. You can return to it anytime." : structuredThought ? "Your interpretation is ready. Retry saving below." : transcript ? "Your transcript is ready. Retry processing below." : recording ? "Your recording is ready. Play it back below or retry transcription." : "Speak naturally. A few seconds is enough to capture an idea.",
    requesting: "Waiting for microphone permission. Check your browser's permission prompt.",
    recording: "Recording. Speak your thought, then press Stop recording.",
    stopping: "Finishing your recording…",
    transcribing: "Transcribing your thought…",
    structuring: "Gemma is making sense of your thought. The first run can take longer…",
    saving: "Saving your thought…",
  }[status];
  const elapsedTime = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
  const isProcessing = status === "transcribing" || status === "structuring" || status === "saving";
  const isDisabled = status === "requesting" || status === "stopping" || isProcessing;
  const steps = [
    { label: "Transcribe", complete: !!transcript, active: status === "transcribing" },
    { label: "Make sense", complete: !!structuredThought, active: status === "structuring" },
    { label: "Save", complete: !!savedThought, active: status === "saving" },
  ];

  return (
    <section aria-labelledby="capture-heading" className="mt-10 min-w-0 rounded-2xl border border-stone-300 bg-white p-6 sm:p-8">
      <h2 id="capture-heading" className="text-xl font-semibold">Capture a thought</h2>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">
        Say what&apos;s on your mind. Stop when you&apos;re done, and Thread will turn it into a thought you can come back to.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-stone-500">
    Audio playback is temporary and clears when you refresh.
      </p>
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={status === "recording" ? stopRecording : startRecording}
          disabled={isDisabled}
          className={`flex min-h-14 items-center justify-center gap-3 rounded-full px-6 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800 disabled:cursor-wait disabled:opacity-60 ${status === "recording" ? "bg-red-700 hover:bg-red-800" : "bg-emerald-900 hover:bg-emerald-800"}`}
        >
          {status === "recording" ? <span aria-hidden="true" className="h-3 w-3 rounded-sm bg-white" /> : isDisabled ? (
            <span aria-hidden="true" className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin" />
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
            </svg>
          )}
          {status === "recording" ? "Stop recording" : status === "requesting" ? "Requesting microphone…" : status === "stopping" ? "Finishing…" : status === "transcribing" ? "Transcribing…" : status === "structuring" ? "Making sense…" : status === "saving" ? "Saving…" : recording ? "Record another thought" : "Record a thought"}
        </button>
        {(status === "recording" || status === "stopping") && (
          <div className="flex items-center gap-3 text-red-800">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-red-600 motion-safe:animate-pulse" />
            <span className="text-sm font-semibold">{status === "recording" ? "Recording" : "Finishing"}</span>
            <span aria-label="Recording duration" role="timer" className="font-mono text-xl tabular-nums">{elapsedTime}</span>
          </div>
        )}
      </div>
      <p role="status" aria-atomic="true" className="mt-4 text-sm leading-relaxed text-stone-700">
        {statusText}
      </p>
      {(isProcessing || recording || transcript || structuredThought || savedThought) && (
        <ol aria-label="Thought processing progress" className="mt-5 grid grid-cols-3 gap-2">
          {steps.map((step, index) => (
            <li key={step.label} aria-current={step.active ? "step" : undefined} className={`min-w-0 rounded-lg border px-2 py-3 text-center text-xs sm:text-sm ${step.complete ? "border-emerald-200 bg-emerald-50 text-emerald-900" : step.active ? "border-emerald-700 bg-white font-semibold text-emerald-900" : "border-stone-200 bg-stone-50 text-stone-500"}`}>
              <span aria-hidden="true" className="mb-1 block">{step.complete ? "✓" : index + 1}</span>
              {step.label}
              <span className="sr-only">{step.complete ? ": complete" : step.active ? ": in progress" : ": pending"}</span>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-900">
          <p className="font-semibold">Something needs your attention</p>
          <p className="mt-1 break-words">{error}</p>
        </div>
      )}
      {savedThought && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Thought saved</p>
          <p className="mt-1">Saved at <time dateTime={savedThought.createdAt}>{new Date(savedThought.createdAt).toLocaleString()}</time></p>
          <Link href={`/thoughts/${savedThought.id}`} className="mt-2 inline-flex min-h-11 items-center rounded font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">Open saved thought →</Link>
        </div>
      )}
      {savedThought && indexing?.id === savedThought.id && (
        <div className="mt-3 text-sm text-stone-600">
          <p role={indexing.status === "error" ? "alert" : "status"}>
            {indexing.status === "loading" ? "Preparing semantic memory. You can record another thought."
              : indexing.status === "ready" ? "Ready for semantic search."
                : "Your thought is saved, but semantic memory could not be prepared. Retry now or open the saved thought later."}
          </p>
          {indexing.status === "error" && <button type="button" onClick={() => void requestIndexing(savedThought.id)} className="mt-2 min-h-11 rounded px-2 font-semibold text-emerald-900 underline focus-visible:outline-2 focus-visible:outline-offset-2">Retry semantic memory</button>}
        </div>
      )}
      {transcript && structuredThought && !savedThought && status === "idle" && (
        <button type="button" onClick={() => void saveThought(transcript, structuredThought)} className="mt-4 min-h-11 rounded px-2 py-2 font-semibold text-emerald-900 underline focus-visible:outline-2 focus-visible:outline-offset-2">
          Retry saving
        </button>
      )}
      {recording && !transcript && status === "idle" && (
        <button type="button" onClick={() => void requestTranscript(recording.blob)} className="mt-4 min-h-11 rounded px-2 py-2 font-semibold text-emerald-900 underline focus-visible:outline-2 focus-visible:outline-offset-2">
          Retry transcription
        </button>
      )}
      {transcript && !structuredThought && status === "idle" && (
        <button type="button" onClick={() => void requestStructuredThought(transcript)} className="mt-4 min-h-11 rounded px-2 py-2 font-semibold text-emerald-900 underline focus-visible:outline-2 focus-visible:outline-offset-2">
          Retry processing
        </button>
      )}
      {transcript && (
        <section aria-labelledby="transcript-heading" className="mt-6 border-t border-stone-200 pt-6">
          <h3 id="transcript-heading" className="text-sm font-semibold tracking-wide">USER SAID · TRANSCRIPT</h3>
          <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">{transcript}</p>
        </section>
      )}
      {structuredThought && (
        <section aria-labelledby="interpretation-heading" className="mt-6 rounded-xl bg-stone-100 p-5">
          <p className="text-xs font-semibold tracking-widest text-emerald-900">AI INTERPRETED · LOCAL GEMMA</p>
          <h3 id="interpretation-heading" className="mt-2 break-words text-xl font-semibold">{structuredThought.title}</h3>
          <p className="mt-3 break-words leading-relaxed text-stone-700">{structuredThought.summary}</p>
          <ul aria-label="Categories" className="mt-4 flex flex-wrap gap-2">
            {structuredThought.categories.map((category) => (
              <li key={category} className="rounded-full bg-white px-3 py-1 text-sm text-stone-700">{category}</li>
            ))}
          </ul>
          {structuredThought.possibleAction && (
            <div className="mt-5">
              <h4 className="text-sm font-semibold">Possible action</h4>
              <p className="mt-1 break-words text-stone-700">{structuredThought.possibleAction}</p>
            </div>
          )}
          {structuredThought.questionToExplore && (
            <div className="mt-5">
              <h4 className="text-sm font-semibold">Question to explore</h4>
              <p className="mt-1 break-words text-stone-700">{structuredThought.questionToExplore}</p>
            </div>
          )}
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
