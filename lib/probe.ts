import Anthropic from "@anthropic-ai/sdk";
import type { ScrapedPage } from "./scrape";
import type { ProbeQuestion, ProbeOutcome, QueryIntent } from "./types";
import { UserError } from "./errors";

const MODEL = "claude-sonnet-5";
const VALID_INTENTS: QueryIntent[] = [
  "awareness",
  "comparison",
  "pricing",
  "category",
  "usecase",
];

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new UserError(
      "Server is missing ANTHROPIC_API_KEY. Add it in your Vercel project's environment variables."
    );
  }
  return new Anthropic({ apiKey });
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

// --- Step 1: generate realistic buyer questions, each tagged with intent ---

export async function generateQuestions(
  page: ScrapedPage
): Promise<ProbeQuestion[]> {
  const client = getClient();

  const prompt = `You are helping a marketer understand what real prospective buyers would ask an AI assistant about their company.

Based on the page text below, generate exactly 5 realistic questions a prospective customer might ask an AI answer engine (like Claude, ChatGPT, or Perplexity) that this page should plausibly help answer. These must sound like real buyer questions, not SEO keywords.

Tag each question with exactly one intent:
- "awareness" — what does this company/product do
- "comparison" — this vs a named or implied competitor
- "pricing" — cost/pricing questions
- "category" — an unbranded question a buyer would ask before they've ever heard of this company: describes the problem or need in their own words, and must NOT name this company, its product, or any specific competitor
- "usecase" — is this good for a specific situation/company type

Return ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:

{
  "questions": [
    { "question": "string", "intent": "awareness" },
    { "question": "string", "intent": "comparison" },
    { "question": "string", "intent": "pricing" },
    { "question": "string", "intent": "category" },
    { "question": "string", "intent": "usecase" }
  ]
}

PAGE TITLE: ${page.title}
PAGE TEXT:
"""
${page.text.slice(0, 6000)}
"""`;

  let message: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    console.error("Anthropic API error (generateQuestions):", err);
    throw new UserError("Couldn't generate questions right now. Please try again.");
  }

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new UserError("The model didn't return a text response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(textBlock.text));
  } catch {
    throw new UserError("Couldn't parse the generated questions. Please try again.");
  }

  const raw = (parsed as { questions?: unknown }).questions;
  if (!Array.isArray(raw)) {
    throw new UserError("The model returned an unexpected format for questions.");
  }

  const questions: ProbeQuestion[] = raw
    .filter(
      (q): q is { question: string; intent: string } =>
        !!q &&
        typeof q === "object" &&
        typeof (q as { question?: unknown }).question === "string" &&
        typeof (q as { intent?: unknown }).intent === "string"
    )
    .slice(0, 5)
    .map((q, i) => ({
      id: `q${i + 1}`,
      question: q.question,
      intent: VALID_INTENTS.includes(q.intent as QueryIntent)
        ? (q.intent as QueryIntent)
        : "awareness",
    }));

  if (questions.length === 0) {
    throw new UserError("Couldn't generate any usable questions for this page.");
  }

  return questions;
}

// --- Step 2: run one fresh, independent live search per question ---

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function domainMatches(candidateUrl: string, targetDomain: string): boolean {
  try {
    const host = normalizeHost(new URL(candidateUrl).hostname);
    const target = normalizeHost(targetDomain);
    return host === target || host.endsWith(`.${target}`);
  } catch {
    return false;
  }
}

interface WebSearchResultItem {
  url?: string;
  title?: string;
}

interface CitationLike {
  url?: string;
}

async function runSingleProbe(
  q: ProbeQuestion,
  targetDomain: string
): Promise<ProbeOutcome> {
  const client = getClient();

  const base: ProbeOutcome = {
    questionId: q.id,
    question: q.question,
    intent: q.intent,
    retrieved: false,
    cited: false,
    citedSources: [],
  };

  try {
    // Fresh, independent request every time — no shared conversation, no
    // replayed/cached search content. Each call is its own real observation.
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 900,
      messages: [
        {
          role: "user",
          content: `Answer this question using web search, and cite your sources: ${q.question}`,
        },
      ],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 2,
        },
      ],
    });

    const retrievedUrls: string[] = [];
    const citedUrls: string[] = [];

    for (const block of message.content as unknown[]) {
      const b = block as {
        type?: string;
        content?: unknown;
        text?: string;
        citations?: unknown;
      };

      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const item of b.content as WebSearchResultItem[]) {
          if (item && typeof item.url === "string") {
            retrievedUrls.push(item.url);
          }
        }
      }

      if (b.type === "text" && Array.isArray(b.citations)) {
        for (const c of b.citations as CitationLike[]) {
          if (c && typeof c.url === "string") {
            citedUrls.push(c.url);
          }
        }
      }
    }

    const retrieved = retrievedUrls.some((u) => domainMatches(u, targetDomain));
    const cited = citedUrls.some((u) => domainMatches(u, targetDomain));

    const otherCitedDomains = Array.from(
      new Set(
        citedUrls
          .filter((u) => !domainMatches(u, targetDomain))
          .map((u) => {
            try {
              return normalizeHost(new URL(u).hostname);
            } catch {
              return null;
            }
          })
          .filter((h): h is string => !!h)
      )
    ).slice(0, 5);

    return {
      ...base,
      retrieved,
      cited,
      citedSources: otherCitedDomains,
    };
  } catch (err) {
    console.error(`Probe failed for question "${q.question}":`, err);
    return { ...base, errored: true };
  }
}

export async function runAllProbes(
  questions: ProbeQuestion[],
  targetDomain: string
): Promise<ProbeOutcome[]> {
  // Run independently and in parallel — each is its own fresh API call.
  // A single failure doesn't take down the batch (see runSingleProbe's catch).
  return Promise.all(questions.map((q) => runSingleProbe(q, targetDomain)));
}
