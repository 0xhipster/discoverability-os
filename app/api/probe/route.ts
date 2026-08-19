import { NextRequest, NextResponse } from "next/server";
import { scrapePage } from "@/lib/scrape";
import { generateQuestions, runAllProbes } from "@/lib/probe";
import { checkRateLimit } from "@/lib/rate-limit";
import { UserError } from "@/lib/errors";
import type { ProbeResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function getClientKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  return `probe:${ip}`;
}

export async function POST(req: NextRequest) {
  const clientKey = getClientKey(req);
  const rateLimit = checkRateLimit(clientKey);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many search checks from this connection. Please wait a moment and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) },
      }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    const url = typeof body?.url === "string" ? body.url : "";

    if (!url || url.trim().length === 0) {
      return NextResponse.json({ error: "Enter a URL to check." }, { status: 400 });
    }

    const page = await scrapePage(url);
    const targetDomain = new URL(page.url).hostname;

    const questions = await generateQuestions(page);
    const outcomes = await runAllProbes(questions, targetDomain);

    const usable = outcomes.filter((o) => !o.errored);
    const response: ProbeResponse = {
      targetDomain,
      outcomes,
      retrievedCount: usable.filter((o) => o.retrieved).length,
      citedCount: usable.filter((o) => o.cited).length,
      totalCount: usable.length,
      probedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof UserError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Unhandled error in /api/probe:", err);
    return NextResponse.json(
      { error: "Something went wrong while running the search check. Please try again." },
      { status: 500 }
    );
  }
}
