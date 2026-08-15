import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResult, Factor, FactorKey, Penalty } from "./types";
import type { ScrapedPage } from "./scrape";
import { UserError } from "./errors";

const MODEL = "claude-sonnet-5";

const FACTOR_KEYS: FactorKey[] = ["statistics", "citations", "quotes", "fluency", "entityClarity"];

// Attribution note: only statistics, citations, and quotes are among the
// top-performing methods actually tested in Aggarwal et al.'s GEO-bench
// study (KDD 2024). Fluency was also tested there, with a smaller measured
// effect. entityClarity is NOT one of the nine methods the paper tested —
// it's a heuristic we layer on top, based on the general (not
// paper-sourced) pattern that AI engines extract concrete claims more
// readily than vague language. The researchNote text below reflects that
// distinction so we're not misattributing findings to a study that didn't
// measure them.
const FACTOR_META: Record<FactorKey, { label: string; researchNote: string }> = {
  statistics: {
    label: "Statistics & hard numbers",
    researchNote:
      "One of the strongest single levers in the Princeton GEO-bench study (Aggarwal et al., KDD 2024) — Statistics Addition showed up to ~40% higher visibility in generative engine answers.",
  },
  citations: {
    label: "External citations",
    researchNote:
      "Citing outside sources (Cite Sources) was one of GEO-bench's top three methods, producing the largest 'equalizer effect' for lower-ranked pages in the study.",
  },
  quotes: {
    label: "Expert quotes",
    researchNote:
      "Quotation Addition was the top-performing single method in GEO-bench, giving AI engines a discrete, directly citable unit of text.",
  },
  fluency: {
    label: "Fluency & directness",
    researchNote:
      "Fluency Optimization was tested in GEO-bench and showed a real, positive effect on visibility — smaller than statistics, citations, or quotes, but consistent.",
  },
  entityClarity: {
    label: "Entity & fact clarity",
    researchNote:
      "Not one of the nine methods GEO-bench tested — this is a heuristic we add on top, based on the general pattern that AI engines extract concrete, specific claims more readily than generic marketing language.",
  },
};

function buildPrompt(page: ScrapedPage): string {
  return `You are a Generative Engine Optimization (GEO) auditor. You evaluate web page text for how likely it is to be extracted, quoted, and cited by AI answer engines (Claude, ChatGPT, Perplexity).

Three of the five factors below (statistics, citations, quotes) are the top-tested methods from the Princeton GEO-bench study (Aggarwal et al., KDD 2024). Fluency was also tested there with a smaller effect. entityClarity is an additional heuristic beyond what that study measured — treat it as a useful signal, not a cited research finding.

Analyze ONLY the page text provided below. Do not assume anything not present in the text.

Score five factors from 0-100 each:
1. statistics — presence of concrete numbers, percentages, dates, measurable claims (not vague superlatives)
2. citations — references to outside sources, studies, named authorities
3. quotes — direct, attributable quotes from named people
4. fluency — how direct and plain the writing is vs. vague marketing jargon ("supercharge your synergy" = low; "processes 50,000 transactions per second" = high)
5. entityClarity — how clearly specific entities are named: product name, category, concrete capabilities, specific claims vs generic fluff

Also flag two penalty patterns if present:
- keywordStuffing — unnatural repetition of keywords/phrases clearly aimed at search engines rather than readers
- vagueAuthorityClaims — unsupported superlatives like "industry-leading," "best-in-class," "world-class" with no evidence backing them

For each factor, give a 0-100 score, a one-sentence finding written in plain English for a marketer (not a developer), and up to 2 short paraphrased pieces of evidence from the page (paraphrase, do not quote verbatim more than a few words).

Return ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:

{
  "overallScore": number,
  "summary": "one or two plain-English sentences summarizing how AI-citation-ready this page is and the single biggest fix",
  "factors": {
    "statistics": { "score": number, "finding": string, "evidence": [string, string] },
    "citations": { "score": number, "finding": string, "evidence": [string, string] },
    "quotes": { "score": number, "finding": string, "evidence": [string, string] },
    "fluency": { "score": number, "finding": string, "evidence": [string, string] },
    "entityClarity": { "score": number, "finding": string, "evidence": [string, string] }
  },
  "penalties": {
    "keywordStuffing": { "detected": boolean, "note": string },
    "vagueAuthorityClaims": { "detected": boolean, "note": string }
  },
  "keyEntities": [string, string, string],
  "llmsSummaryFacts": [string, string, string, string, string]
}

"llmsSummaryFacts" should be 3-5 short, factual, standalone sentences (no marketing tone) that best represent what this page is about — these will be published directly in an llms.txt file for AI crawlers, so they must be accurate to the page content and information-dense.

PAGE TITLE: ${page.title}
PAGE URL: ${page.url}

PAGE TEXT:
"""
${page.text}
"""`;
}

interface ClaudeFactorOut {
  score: number;
  finding: string;
  evidence: string[];
}

interface ClaudeAnalysisOut {
  overallScore: number;
  summary: string;
  factors: Record<FactorKey, ClaudeFactorOut>;
  penalties: {
    keywordStuffing: { detected: boolean; note: string };
    vagueAuthorityClaims: { detected: boolean; note: string };
  };
  keyEntities: string[];
  llmsSummaryFacts: string[];
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  // Handles ```json ... ```, plain ``` ... ```, or no fence at all.
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function isFactorOut(value: unknown): value is ClaudeFactorOut {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.score === "number" &&
    typeof v.finding === "string" &&
    Array.isArray(v.evidence) &&
    v.evidence.every((e) => typeof e === "string")
  );
}

function isValidClaudeOutput(value: unknown): value is ClaudeAnalysisOut {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;

  if (typeof v.overallScore !== "number" || typeof v.summary !== "string") return false;

  const factors = v.factors as Record<string, unknown> | undefined;
  if (!factors || typeof factors !== "object") return false;
  if (!FACTOR_KEYS.every((key) => isFactorOut(factors[key]))) return false;

  const penalties = v.penalties as Record<string, unknown> | undefined;
  if (!penalties || typeof penalties !== "object") return false;
  const keywordStuffing = penalties.keywordStuffing as Record<string, unknown> | undefined;
  const vagueAuthorityClaims = penalties.vagueAuthorityClaims as Record<string, unknown> | undefined;
  if (
    !keywordStuffing ||
    typeof keywordStuffing.detected !== "boolean" ||
    typeof keywordStuffing.note !== "string"
  )
    return false;
  if (
    !vagueAuthorityClaims ||
    typeof vagueAuthorityClaims.detected !== "boolean" ||
    typeof vagueAuthorityClaims.note !== "string"
  )
    return false;

  if (!Array.isArray(v.keyEntities) || !v.keyEntities.every((e) => typeof e === "string")) return false;
  if (!Array.isArray(v.llmsSummaryFacts) || !v.llmsSummaryFacts.every((f) => typeof f === "string"))
    return false;

  return true;
}

function parseClaudeJson(raw: string): ClaudeAnalysisOut {
  const cleaned = stripCodeFence(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new UserError("Couldn't parse the model's analysis. Please try again.");
  }

  if (!isValidClaudeOutput(parsed)) {
    throw new UserError("The model returned an unexpected format. Please try again.");
  }

  return parsed;
}

function buildLlmsTxt(page: ScrapedPage, out: ClaudeAnalysisOut): string {
  const lines = [
    `# ${page.title}`,
    ``,
    `> Source: ${page.url}`,
    `> Generated by DiscoverabilityOS on ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `## Summary`,
    ``,
    out.summary,
    ``,
    `## Key facts`,
    ``,
    ...out.llmsSummaryFacts.map((f) => `- ${f}`),
    ``,
    `## Key entities`,
    ``,
    ...out.keyEntities.map((e) => `- ${e}`),
    ``,
  ];
  return lines.join("\n");
}

export async function analyzePage(page: ScrapedPage): Promise<AnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new UserError(
      "Server is missing ANTHROPIC_API_KEY. Add it in your Vercel project's environment variables."
    );
  }

  const client = new Anthropic({ apiKey });

  let message: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: buildPrompt(page) }],
    });
  } catch (err) {
    // Don't forward raw SDK error text (can include account/rate-limit
    // internals) to the client — log it server-side and show a generic
    // message instead.
    console.error("Anthropic API error:", err);
    throw new UserError("Couldn't complete the analysis right now. Please try again in a moment.");
  }

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new UserError("The model didn't return a text response.");
  }

  const out = parseClaudeJson(textBlock.text);

  const factors: Factor[] = FACTOR_KEYS.map((key) => {
    const f = out.factors[key];
    return {
      key,
      label: FACTOR_META[key].label,
      score: clamp(f.score),
      finding: f.finding,
      evidence: f.evidence ?? [],
      researchNote: FACTOR_META[key].researchNote,
    };
  });

  const penalties: Penalty[] = [
    {
      label: "Keyword stuffing",
      detected: out.penalties.keywordStuffing.detected,
      note: out.penalties.keywordStuffing.note,
    },
    {
      label: "Vague authority claims",
      detected: out.penalties.vagueAuthorityClaims.detected,
      note: out.penalties.vagueAuthorityClaims.note,
    },
  ];

  return {
    url: page.url,
    title: page.title,
    overallScore: clamp(out.overallScore),
    summary: out.summary,
    factors,
    penalties,
    llmsTxt: buildLlmsTxt(page, out),
    wordCount: page.wordCount,
    scannedAt: new Date().toISOString(),
  };
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
