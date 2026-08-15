"use client";

import { useState } from "react";
import type { AnalysisResult } from "@/lib/types";

type Status = "idle" | "scanning" | "error" | "done";

const SCAN_LOG = [
  "resolving host…",
  "fetching document…",
  "stripping nav / footer / scripts…",
  "extracting readable text…",
  "scanning for statistics, citations, quotes…",
  "scoring against GEO-bench factors…",
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [logIndex, setLogIndex] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setStatus("scanning");
    setError("");
    setResult(null);
    setLogIndex(0);

    const interval = setInterval(() => {
      setLogIndex((i) => (i < SCAN_LOG.length - 1 ? i + 1 : i));
    }, 550);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Scan failed.");
      }

      clearInterval(interval);
      setResult(data as AnalysisResult);
      setStatus("done");
    } catch (err) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : "Scan failed.");
      setStatus("error");
    }
  }

  function downloadLlmsTxt() {
    if (!result) return;
    const blob = new Blob([result.llmsTxt], { type: "text/markdown" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "llms.txt";
    link.click();
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <Header />

        <form onSubmit={handleScan} className="mt-12">
          <label
            htmlFor="url"
            className="block font-mono text-xs uppercase tracking-[0.2em] text-muted"
          >
            Target URL
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="url"
              type="text"
              placeholder="yourproduct.com/landing-page"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={status === "scanning"}
              className="flex-1 rounded-sm border border-line bg-panel px-4 py-3 font-mono text-sm text-paper placeholder:text-muted/60 outline-none focus:border-signal focus:ring-1 focus:ring-signal disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={status === "scanning" || !url.trim()}
              className="whitespace-nowrap rounded-sm bg-signal px-6 py-3 font-mono text-sm font-medium text-ink transition hover:bg-signal/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "scanning" ? "Scanning…" : "Run scan →"}
            </button>
          </div>
        </form>

        {status === "scanning" && <ScanningPanel logIndex={logIndex} />}
        {status === "error" && <ErrorPanel message={error} />}
        {status === "done" && result && (
          <ResultPanel result={result} onDownload={downloadLlmsTxt} />
        )}

        {status === "idle" && <IdleHint />}
      </div>
    </main>
  );
}

function Header() {
  return (
    <div className="animate-rise">
      <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-signal">
        <span className="h-1.5 w-1.5 rounded-full bg-signal" />
        DiscoverabilityOS
      </div>
      <h1 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">
        Will an AI engine{" "}
        <span className="text-signal">quote this page</span>, or skip it?
      </h1>
      <p className="mt-4 max-w-xl font-mono text-sm leading-relaxed text-muted">
        Paste a URL. Claude scores it on five factors — statistics,
        citations, and quotes are the top-tested methods from Princeton's
        GEO-bench study (KDD 2024); fluency and entity clarity are
        additional heuristics layered on top. Then it outputs an{" "}
        <span className="text-paper">llms.txt</span> file ready for AI
        crawlers.
      </p>
    </div>
  );
}

function IdleHint() {
  return (
    <div className="mt-10 flex items-center gap-2 font-mono text-xs text-muted/70">
      <span className="cursor-blink" />
      <span>waiting for a target</span>
    </div>
  );
}

function ScanningPanel({ logIndex }: { logIndex: number }) {
  return (
    <div className="animate-rise mt-8 overflow-hidden rounded-sm border border-line bg-panel">
      <div className="relative h-0.5 w-full overflow-hidden bg-line">
        <div className="absolute h-full w-1/3 bg-signal animate-[scanline_1.4s_ease-in-out_infinite]" />
      </div>
      <div className="space-y-2 p-5 font-mono text-xs text-muted">
        {SCAN_LOG.map((line, i) => (
          <div
            key={line}
            className={`transition-opacity duration-300 ${
              i <= logIndex ? "opacity-100" : "opacity-20"
            }`}
          >
            <span className="text-signal">$</span> {line}
            {i === logIndex && <span className="cursor-blink" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="animate-rise mt-8 rounded-sm border border-flag/40 bg-flag/10 p-5">
      <div className="font-mono text-xs uppercase tracking-[0.15em] text-flag">
        Scan failed
      </div>
      <p className="mt-2 font-mono text-sm text-paper/90">{message}</p>
    </div>
  );
}

function ResultPanel({
  result,
  onDownload,
}: {
  result: AnalysisResult;
  onDownload: () => void;
}) {
  return (
    <div className="animate-rise mt-10 space-y-8">
      <div className="flex flex-col gap-6 rounded-sm border border-line bg-panel p-6 sm:flex-row sm:items-center">
        <ScoreGauge score={result.overallScore} />
        <div className="flex-1">
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            {new URL(result.url).hostname}
          </div>
          <div className="mt-1 font-display text-lg font-medium text-paper">
            {result.title}
          </div>
          <p className="mt-2 font-mono text-sm leading-relaxed text-muted">
            {result.summary}
          </p>
          <div className="mt-3 font-mono text-[11px] text-muted/60">
            {result.wordCount.toLocaleString()} words scanned
          </div>
        </div>
      </div>

      <div>
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          Factor breakdown
        </h2>
        <div className="mt-4 space-y-4">
          {result.factors.map((f) => (
            <div key={f.key} className="rounded-sm border border-line bg-panel p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="font-display text-sm font-medium text-paper">
                  {f.label}
                </span>
                <span
                  className={`font-mono text-sm font-semibold ${scoreColor(f.score)}`}
                >
                  {f.score}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
                <div
                  className={`h-full rounded-full ${scoreBar(f.score)}`}
                  style={{ width: `${f.score}%` }}
                />
              </div>
              <p className="mt-3 font-mono text-xs leading-relaxed text-muted">
                {f.finding}
              </p>
              {f.evidence.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {f.evidence.map((e, i) => (
                    <li key={i} className="font-mono text-[11px] text-muted/70">
                      · {e}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 border-t border-line pt-2 font-mono text-[10px] leading-relaxed text-muted/50">
                {f.researchNote}
              </p>
            </div>
          ))}
        </div>
      </div>

      {result.penalties.some((p) => p.detected) && (
        <div>
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-flag">
            Flags
          </h2>
          <div className="mt-3 space-y-2">
            {result.penalties
              .filter((p) => p.detected)
              .map((p) => (
                <div
                  key={p.label}
                  className="rounded-sm border border-flag/30 bg-flag/5 p-3 font-mono text-xs text-paper/90"
                >
                  <span className="text-flag">{p.label}:</span> {p.note}
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="rounded-sm border border-line bg-panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            llms.txt output
          </h2>
          <button
            onClick={onDownload}
            className="rounded-sm border border-signal/40 px-4 py-1.5 font-mono text-xs text-signal transition hover:bg-signal/10"
          >
            Download ↓
          </button>
        </div>
        <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted">
          {result.llmsTxt}
        </pre>
      </div>
    </div>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 70 ? "#5EEAD4" : score >= 40 ? "#F2B84B" : "#E8604C";

  return (
    <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
      <svg width="112" height="112" className="-rotate-90">
        <circle cx="56" cy="56" r={radius} stroke="#1F2A30" strokeWidth="8" fill="none" />
        <circle
          cx="56"
          cy="56"
          r={radius}
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-2xl font-semibold text-paper">
          {score}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          GEO score
        </span>
      </div>
    </div>
  );
}

function scoreColor(score: number) {
  if (score >= 70) return "text-signal";
  if (score >= 40) return "text-amber";
  return "text-flag";
}

function scoreBar(score: number) {
  if (score >= 70) return "bg-signal";
  if (score >= 40) return "bg-amber";
  return "bg-flag";
}
