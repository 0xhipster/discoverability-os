"use client";

import { useRef, useState } from "react";
import type {
  AnalysisResult,
  ProbeResponse,
  QueryIntent,
  RemediationResult,
} from "@/lib/types";

type Status = "idle" | "scanning" | "error" | "done";
type ProbeStatus = "idle" | "running" | "error" | "done";
type RemedyStatus = "idle" | "running" | "error" | "done";

const EXAMPLE_URLS = [
  { label: "Vercel", url: "https://vercel.com" },
  { label: "Linear", url: "https://linear.app" },
  { label: "Stripe", url: "https://stripe.com" },
];

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
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const [probeStatus, setProbeStatus] = useState<ProbeStatus>("idle");
  const [probeError, setProbeError] = useState("");
  const [probeResult, setProbeResult] = useState<ProbeResponse | null>(null);

  const [remedyStatus, setRemedyStatus] = useState<RemedyStatus>("idle");
  const [remedyError, setRemedyError] = useState("");
  const [remedyResult, setRemedyResult] = useState<RemediationResult | null>(null);

  const probeSectionRef = useRef<HTMLDivElement>(null);
  const remedySectionRef = useRef<HTMLDivElement>(null);

  function scrollToSection(ref: React.RefObject<HTMLDivElement>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setStatus("scanning");
    setError("");
    setResult(null);
    setLogIndex(0);
    setElapsedSeconds(0);
    setProbeStatus("idle");
    setProbeResult(null);
    setProbeError("");
    setRemedyStatus("idle");
    setRemedyResult(null);
    setRemedyError("");

    const logInterval = setInterval(() => {
      setLogIndex((i) => (i < SCAN_LOG.length - 1 ? i + 1 : i));
    }, 550);

    // Real, measured elapsed time. Shown alongside the estimated progress
    // bar below so there's always a truthful number on screen, since a
    // scan can silently retry server-side and its real duration isn't
    // knowable from the browser.
    const clockInterval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

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

      clearInterval(logInterval);
      clearInterval(clockInterval);
      setResult(data as AnalysisResult);
      setStatus("done");
    } catch (err) {
      clearInterval(logInterval);
      clearInterval(clockInterval);
      setError(err instanceof Error ? err.message : "Scan failed.");
      setStatus("error");
    }
  }

  async function handleProbe() {
    if (!url.trim()) return;

    setProbeStatus("running");
    setProbeError("");
    setProbeResult(null);

    try {
      const res = await fetch("/api/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Search check failed.");
      }

      setProbeResult(data as ProbeResponse);
      setProbeStatus("done");
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : "Search check failed.");
      setProbeStatus("error");
    }
  }

  async function handleRemediate() {
    if (!url.trim()) return;

    setRemedyStatus("running");
    setRemedyError("");
    setRemedyResult(null);

    try {
      const res = await fetch("/api/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Rewrite failed.");
      }

      setRemedyResult(data as RemediationResult);
      setRemedyStatus("done");
    } catch (err) {
      setRemedyError(err instanceof Error ? err.message : "Rewrite failed.");
      setRemedyStatus("error");
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-muted/60">Try:</span>
            {EXAMPLE_URLS.map((ex) => (
              <button
                key={ex.url}
                type="button"
                onClick={() => setUrl(ex.url)}
                disabled={status === "scanning"}
                className="rounded-sm border border-line px-2.5 py-1 font-mono text-[11px] text-muted transition hover:border-signal/40 hover:text-signal disabled:cursor-not-allowed disabled:opacity-40"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </form>

        {status === "scanning" && (
          <ScanningPanel logIndex={logIndex} elapsedSeconds={elapsedSeconds} />
        )}
        {status === "error" && <ErrorPanel message={error} />}
        {status === "done" && result && (
          <>
            <ResultPanel
              result={result}
              onDownload={downloadLlmsTxt}
              nextSteps={
                <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-line/60 bg-panel/50 px-4 py-3 font-mono text-[11px] text-muted">
                  <span className="text-muted/60">Next:</span>
                  <button
                    type="button"
                    onClick={() => scrollToSection(probeSectionRef)}
                    className="text-signal underline-offset-4 transition hover:underline"
                  >
                    test it against live search
                  </button>
                  <span className="text-muted/40">or</span>
                  <button
                    type="button"
                    onClick={() => scrollToSection(remedySectionRef)}
                    className="text-signal underline-offset-4 transition hover:underline"
                  >
                    generate a rewrite
                  </button>
                </div>
              }
            />

            <div ref={probeSectionRef} className="mt-8 rounded-sm border border-line bg-panel p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
                    Prediction vs. reality
                  </h2>
                  <p className="mt-1 font-mono text-xs leading-relaxed text-muted/70">
                    The score above is a model's prediction. This checks what actually
                    happens when Claude searches the live web.
                  </p>
                </div>
                <button
                  onClick={handleProbe}
                  disabled={probeStatus === "running"}
                  className="whitespace-nowrap rounded-sm border border-signal/40 px-5 py-2.5 font-mono text-xs text-signal transition hover:bg-signal/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {probeStatus === "running"
                    ? "Searching live…"
                    : "Run live search check →"}
                </button>
              </div>

              {probeStatus === "error" && (
                <p className="mt-4 font-mono text-xs text-flag">{probeError}</p>
              )}
              {probeStatus === "done" && probeResult && (
                <ProbePanel result={probeResult} predictedScore={result.overallScore} />
              )}
            </div>

            <div ref={remedySectionRef} className="mt-8 rounded-sm border border-line bg-panel p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
                    Suggested rewrite
                  </h2>
                  <p className="mt-1 font-mono text-xs leading-relaxed text-muted/70">
                    Restructures the copy this scan flagged, reusing only facts already on
                    the page. Missing evidence is marked as a placeholder, never invented.
                  </p>
                </div>
                <button
                  onClick={handleRemediate}
                  disabled={remedyStatus === "running"}
                  className="whitespace-nowrap rounded-sm border border-signal/40 px-5 py-2.5 font-mono text-xs text-signal transition hover:bg-signal/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {remedyStatus === "running"
                    ? "Rewriting…"
                    : "Generate rewrite →"}
                </button>
              </div>

              {remedyStatus === "error" && (
                <p className="mt-4 font-mono text-xs text-flag">{remedyError}</p>
              )}
              {remedyStatus === "done" && remedyResult && (
                <RemediationPanel result={remedyResult} />
              )}
            </div>
          </>
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
        Discoverability Score
      </div>
      <h1 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">
        Will an AI engine{" "}
        <span className="text-signal">quote this page</span>, or skip it?
      </h1>
      <p className="mt-4 max-w-xl font-mono text-sm leading-relaxed text-muted">
        AI assistants answer questions about your product by quoting pages they
        find credible. If yours reads like marketing copy, they skip it. Paste
        a URL to see how yours scores and what to change.
      </p>
      <p className="mt-2 max-w-xl font-mono text-xs leading-relaxed text-muted/60">
        Five factors, three drawn from Princeton's GEO-bench study (KDD 2024),
        two our own.
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

function estimateProgress(seconds: number): number {
  // Asymptotic curve that approaches but never reaches 100, since the real
  // completion time isn't knowable from the browser (the scan can silently
  // retry server-side). Feels like progress without claiming precision it
  // doesn't have; the actual elapsed-seconds readout next to it is the
  // honest number.
  const pct = 92 * (1 - Math.exp(-seconds / 8));
  return Math.round(pct);
}

function ScanningPanel({
  logIndex,
  elapsedSeconds,
}: {
  logIndex: number;
  elapsedSeconds: number;
}) {
  const pct = estimateProgress(elapsedSeconds);

  return (
    <div className="animate-rise mt-8 overflow-hidden rounded-sm border border-line bg-panel">
      <div className="relative h-0.5 w-full overflow-hidden bg-line">
        <div className="absolute h-full w-1/3 bg-signal animate-[scanline_1.4s_ease-in-out_infinite]" />
      </div>

      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-signal transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <span className="ml-4 whitespace-nowrap font-mono text-[11px] text-muted">
          ~{pct}% &middot; {elapsedSeconds}s elapsed
        </span>
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
  nextSteps,
}: {
  result: AnalysisResult;
  onDownload: () => void;
  nextSteps?: React.ReactNode;
}) {
  const [llmsOpen, setLlmsOpen] = useState(false);

  return (
    <div className="animate-rise mt-10 space-y-8">
      <div className="flex flex-col gap-6 rounded-sm border border-line bg-panel p-6 sm:flex-row sm:items-center">
        <ScoreGauge score={result.overallScore} />
        <div className="flex-1">
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            {new URL(result.url).hostname}
          </div>
          <div className="mt-1 font-display text-lg font-medium text-paper break-words">
            {result.title}
          </div>
          <p className="mt-2 font-mono text-sm leading-relaxed text-muted break-words">
            {result.summary}
          </p>
          <div className="mt-3 font-mono text-[11px] text-muted/60">
            {result.wordCount.toLocaleString()} words scanned
          </div>
        </div>
      </div>

      {nextSteps}

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
              <p className="mt-3 font-mono text-xs leading-relaxed text-muted break-words">
                {f.finding}
              </p>
              {f.evidence.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {f.evidence.map((e, i) => (
                    <li key={i} className="font-mono text-[11px] text-muted/70 break-words">
                      · {e}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 border-t border-line pt-2 font-mono text-[10px] leading-relaxed text-muted/50 break-words">
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
                  className="rounded-sm border border-flag/30 bg-flag/5 p-3 font-mono text-xs text-paper/90 break-words"
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLlmsOpen((v) => !v)}
              className="rounded-sm border border-line px-3 py-1.5 font-mono text-xs text-muted transition hover:border-signal/40 hover:text-signal"
            >
              {llmsOpen ? "Hide ▴" : "Show ▾"}
            </button>
            <button
              onClick={onDownload}
              className="rounded-sm border border-signal/40 px-4 py-1.5 font-mono text-xs text-signal transition hover:bg-signal/10"
            >
              Download ↓
            </button>
          </div>
        </div>
        {llmsOpen ? (
          <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted">
            {result.llmsTxt}
          </pre>
        ) : (
          <p className="mt-3 font-mono text-[11px] text-muted/60">
            A structured summary of this page for AI crawlers. Download it, or show it
            here.
          </p>
        )}
      </div>
    </div>
  );
}

function ProbePanel({
  result,
  predictedScore,
}: {
  result: ProbeResponse;
  predictedScore: number;
}) {
  return (
    <div className="animate-rise mt-5 space-y-3">
      <p className="font-mono text-[11px] leading-relaxed text-muted/60">
        Retrieved means Claude's search found and read the page. Cited means Claude
        trusted it enough to actually use it in the answer. A page can be retrieved
        and still lose to a source the model judged more useful.
      </p>

      {result.outcomes.map((o, i) => (
        <div
          key={o.questionId}
          className="rounded-sm border border-line bg-ink/40 p-3"
          style={{ animationDelay: `${i * 120}ms` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="mr-2 rounded-sm bg-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
                {intentLabel(o.intent)}
              </span>
              <span className="font-mono text-xs text-paper/90 break-words">{o.question}</span>
            </div>
          </div>

          {o.errored ? (
            <div className="mt-2 font-mono text-[11px] text-muted/60">
              This check failed to complete, not counted in the totals below.
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge ok={o.retrieved} label="Retrieved" />
              <Badge ok={o.cited} label="Cited" />
              {!o.cited && o.citedSources.length > 0 && (
                <span className="font-mono text-[11px] text-muted/60 break-words">
                  Cited instead: {o.citedSources.join(", ")}
                </span>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="mt-4 border-t border-line pt-4">
        {result.totalCount === 0 ? (
          <p className="font-mono text-sm text-paper">
            No searches completed, so there is nothing to compare against the predicted{" "}
            <span className="text-signal">{predictedScore}/100</span>. This is a failure
            to measure, not a result of zero. Try running the check again.
          </p>
        ) : (
          <p className="font-mono text-sm text-paper">
            Predicted: <span className="text-signal">{predictedScore}/100</span>. Across{" "}
            {result.totalCount} live searches, retrieved{" "}
            <span className="text-signal">{result.retrievedCount}</span>, actually cited{" "}
            <span className="text-signal">{result.citedCount}</span>.
          </p>
        )}
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted/60">
          This is a live snapshot from a single run against Claude's web search, not a
          statistical benchmark, and not a measure of ChatGPT, Google, or any other AI
          system. Run it again later and results may differ; model answers aren't
          perfectly consistent run to run. Category and comparison questions are
          harder to win than branded ones: the page is competing against the whole
          web, not just its own name, so a low count here doesn't mean the tool is
          broken.
        </p>
      </div>
    </div>
  );
}

function RemediationPanel({ result }: { result: RemediationResult }) {
  return (
    <div className="animate-rise mt-5 space-y-5">
      {result.blocks.map((b) => (
        <div key={b.label} className="rounded-sm border border-line bg-ink/40 p-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-signal">
            {b.label}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted/60">
                Current
              </div>
              <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-muted/70 break-words">
                {b.current}
              </p>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-signal/70">
                Suggested
              </div>
              <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-paper/90 break-words">
                {b.suggested}
              </p>
            </div>
          </div>

          <p className="mt-3 border-t border-line pt-2 font-mono text-[10px] leading-relaxed text-muted/50 break-words">
            {b.rationale}
          </p>
        </div>
      ))}

      {result.missingEvidence.length > 0 && (
        <div className="rounded-sm border border-amber/30 bg-amber/5 p-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-amber">
            Evidence you need to supply
          </div>
          <ul className="mt-2 space-y-1">
            {result.missingEvidence.map((m, i) => (
              <li key={i} className="font-mono text-[11px] leading-relaxed text-paper/80 break-words">
                · {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="font-mono text-[11px] leading-relaxed text-muted/60">
        This rewrite reuses only facts already present on the scanned page. Anything in
        [BRACKETS] is a gap the page does not currently answer, and you need to supply the
        real figure. Nothing here has been verified against a source.
      </p>
    </div>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`rounded-sm px-2 py-0.5 font-mono text-[11px] ${
        ok ? "bg-signal/15 text-signal" : "bg-flag/10 text-flag"
      }`}
    >
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}

function intentLabel(intent: QueryIntent): string {
  switch (intent) {
    case "awareness":
      return "awareness";
    case "comparison":
      return "comparison";
    case "pricing":
      return "pricing";
    case "category":
      return "category";
    case "usecase":
      return "use case";
    default:
      return intent;
  }
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
          Citation readiness
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
  if (score >= 70) return "bg-signal shadow-[0_0_8px_rgba(94,234,212,0.4)]";
  if (score >= 40) return "bg-amber shadow-[0_0_8px_rgba(242,184,75,0.4)]";
  return "bg-flag shadow-[0_0_8px_rgba(232,96,76,0.4)]";
}
