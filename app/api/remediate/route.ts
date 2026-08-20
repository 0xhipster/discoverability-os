import { NextRequest, NextResponse } from "next/server";
import { scrapePage } from "@/lib/scrape";
import { analyzePage } from "@/lib/scoring";
import { generateRemediation } from "@/lib/remediate";
import { checkRateLimit } from "@/lib/rate-limit";
import { UserError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

function getClientKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  return `remediate:${ip}`;
}

export async function POST(req: NextRequest) {
  const clientKey = getClientKey(req);
  const rateLimit = checkRateLimit(clientKey);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many rewrite requests from this connection. Please wait a moment and try again.",
      },
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
      return NextResponse.json({ error: "Enter a URL first." }, { status: 400 });
    }

    // Re-scrape and re-analyze server-side. The client already has an
    // analysis, but trusting client-supplied scores would let anyone post
    // arbitrary JSON straight into a model prompt.
    const page = await scrapePage(url);
    const analysis = await analyzePage(page);
    const remediation = await generateRemediation(page, analysis);

    return NextResponse.json(remediation);
  } catch (err) {
    if (err instanceof UserError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Unhandled error in /api/remediate:", err);
    return NextResponse.json(
      { error: "Something went wrong while generating the rewrite. Please try again." },
      { status: 500 }
    );
  }
}
