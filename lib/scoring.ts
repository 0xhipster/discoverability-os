import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResult, Factor, FactorKey, Penalty } from "./types";
import type { ScrapedPage } from "./scrape";

const MODEL = "claude-sonnet-5";

const FACTOR_META: Record<FactorKey, { label: string; researchNote: string }> = {
  statistics: {
    label: "Statistics & hard numbers",
    researchNote:
      "The strongest single lever in the Princeton GEO-bench study (Aggarwal et al., KDD 2024) — up to +40% visibility in generative engine answers.",
  },
  citations: {
    label: "External citations",
    researchNote:
      "Citing outside sources produced the largest 'equalizer effect' in GEO-bench — up to +115% visibility for lower-ranked pages.",
  },
  quotes: {
    label: "Expert quotes",
    researchNote:
      "Direct, attributable quotes were the second-strongest factor in GEO-bench, giving AI engines a discrete, citable unit of text.",
  },
  fluency: {
    label: "Fluency & directness",
    researchNote:
      "GEO-bench found generative engines reward direct, plainly-stated claims over persuasive or jargon-heavy tone.",
  },
  entityClarity: {
    label: "Entity & fact clarity",
    researchNote:
      "AI engines extract concrete entities (products, categories, specific claims) far more readily than generic marketing language.",
  },
};

function buildPrompt(page: ScrapedPage): string {
  return `You are a Generative Engine Optimization (GEO) auditor. You evaluate web page text for how likely it is to be extracted, quoted, and cited by AI answer engines (Claude, ChatGPT, Perplexity), based on the findings of the Princeton GEO-bench study (Aggarwal et al., KDD 2024).

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

function parseClaudeJson(raw: string): ClaudeAnalysisOut {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("Couldn't parse the model's analysis. Try again.");
  }
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
    throw new Error(
      "Server is missing ANTHROPIC_API_KEY. Add it in your Vercel project's environment variables."
    );
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: "user", content: buildPrompt(page) }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("The model didn't return a text response.");
  }

  const out = parseClaudeJson(textBlock.text);

  const factors: Factor[] = (Object.keys(FACTOR_META) as FactorKey[]).map((key) => {
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
