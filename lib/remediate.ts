import Anthropic from "@anthropic-ai/sdk";
import type { ScrapedPage } from "./scrape";
import type { AnalysisResult, RemediationResult, RewriteBlock } from "./types";
import { UserError } from "./errors";

const MODEL = "claude-sonnet-5";

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

function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}

// Compact summary of what the scan actually diagnosed. This is the whole
// point of the feature: the rewrite targets the specific measured
// weaknesses rather than doing a generic copy polish.
function buildDiagnosis(analysis: AnalysisResult): string {
  const factorLines = analysis.factors
    .map((f) => `- ${f.label}: scored ${f.score}/100. ${f.finding}`)
    .join("\n");

  const detected = analysis.penalties.filter((p) => p.detected);
  const penaltyLines = detected.length
    ? detected.map((p) => `- ${p.label}: ${p.note}`).join("\n")
    : "- None detected.";

  return `SCORES AND FINDINGS:\n${factorLines}\n\nFLAGS RAISED:\n${penaltyLines}`;
}

function buildPrompt(page: ScrapedPage, analysis: AnalysisResult): string {
  return `You are a technical writer who restructures web page copy so that AI answer engines can extract and cite concrete facts from it. You are not a marketing copywriter. You do not write hype, taglines, or persuasive flourish.

A diagnostic scan of the page below produced this assessment:

${buildDiagnosis(analysis)}

Your task: rewrite two blocks of this page so they address the specific weaknesses above.

1. "Hero": the opening positioning block. What the product is and who it is for.
2. "Core features": the main capability or product description block.

Identify each block from the page text yourself. The page text is a flattened extraction, so exact section boundaries are not marked.

ABSOLUTE RULE ON FACTS: You must never invent, estimate, or infer a statistic, metric, percentage, date, customer name, price, or quotation that does not already appear in the page text. This is the single most important constraint. Where the diagnosis says evidence is missing and the page does not contain it, write a bracketed placeholder in SCREAMING_SNAKE_CASE describing exactly what the company must supply, for example [INSERT_MEASURED_UPTIME_PERCENTAGE] or [INSERT_NAMED_CUSTOMER_QUOTE]. A placeholder is always correct. A plausible-sounding invented number is always wrong.

Facts that DO appear in the page text may and should be reused, moved earlier, and stated more plainly.

WRITING RULES:
- Lead with the concrete claim, not the positioning.
- Prefer short, self-contained sentences that remain true when quoted in isolation.
- Name specific entities: products, components, standards, integrations.
- Remove unsupported superlatives ("best-in-class", "industry-leading", "seamless") entirely rather than softening them.
- Do not add headings, markdown, or formatting characters. Plain prose only.

STRICT FORMATTING RULE: You are strictly forbidden from using em dashes or en dashes anywhere in your output. Use commas, colons, or separate sentences instead.

Keep "current" to at most 2 to 3 representative sentences from that block, not the entire block verbatim, even if the real section on the page is longer. Keep "suggested" to a similar length. This is a comparison sample, not a full replacement page.

Return ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:

{
  "blocks": [
    {
      "label": "Hero",
      "current": "the existing copy for this block, quoted from the page text",
      "suggested": "your rewritten version",
      "rationale": "one short sentence naming which diagnosed weakness this addresses"
    },
    {
      "label": "Core features",
      "current": "the existing copy for this block, quoted from the page text",
      "suggested": "your rewritten version",
      "rationale": "one short sentence naming which diagnosed weakness this addresses"
    }
  ],
  "missingEvidence": [string, string, string]
}

"missingEvidence" is 3 to 5 short, specific items the company must supply to make this page genuinely citable, phrased as concrete asks, for example "A measured throughput figure with the test conditions stated" rather than "more data".

PAGE TITLE: ${page.title}
PAGE URL: ${page.url}

PAGE TEXT:
"""
${page.text.slice(0, 8000)}
"""`;
}

interface RemediationOut {
  blocks: RewriteBlock[];
  missingEvidence: string[];
}

function isRewriteBlock(value: unknown): value is RewriteBlock {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.label === "string" &&
    typeof v.current === "string" &&
    typeof v.suggested === "string" &&
    typeof v.rationale === "string"
  );
}

function isValidOutput(value: unknown): value is RemediationOut {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.blocks) || v.blocks.length === 0) return false;
  if (!v.blocks.every(isRewriteBlock)) return false;
  if (!Array.isArray(v.missingEvidence)) return false;
  if (!v.missingEvidence.every((m) => typeof m === "string")) return false;
  return true;
}

export async function generateRemediation(
  page: ScrapedPage,
  analysis: AnalysisResult
): Promise<RemediationResult> {
  const client = getClient();

  let message: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content: buildPrompt(page, analysis) }],
    });
  } catch (err) {
    console.error("Anthropic API error (generateRemediation):", err);
    throw new UserError(
      "Couldn't generate the rewrite right now. Please try again in a moment."
    );
  }

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new UserError("The model didn't return a text response.");
  }

  const cleaned = stripCodeFence(textBlock.text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    try {
      parsed = JSON.parse(extractJsonObject(cleaned));
    } catch {
      console.error(
        "Raw model output that failed to parse (remediate):",
        textBlock.text.slice(0, 2000)
      );
      throw new UserError("Couldn't parse the suggested rewrite. Please try again.");
    }
  }

  if (!isValidOutput(parsed)) {
    throw new UserError("The model returned an unexpected format. Please try again.");
  }

  return {
    url: page.url,
    blocks: parsed.blocks.slice(0, 2),
    missingEvidence: parsed.missingEvidence.slice(0, 5),
    generatedAt: new Date().toISOString(),
  };
}
