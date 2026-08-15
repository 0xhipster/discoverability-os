import { NextRequest, NextResponse } from "next/server";
import { scrapePage } from "@/lib/scrape";
import { analyzePage } from "@/lib/scoring";
import { checkRateLimit } from "@/lib/rate-limit";
import { UserError } from "@/lib/errors";

export const runtime = "nodejs";
// NOTE: 60s requires either the Vercel Pro plan or Fluid Compute enabled on
// Hobby — Hobby's default function timeout is 10s. See README.
export const maxDuration = 60;

function getClientKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : "unknown";
}

export async function POST(req: NextRequest) {
  const clientKey = getClientKey(req);
  const rateLimit = checkRateLimit(clientKey);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many scans from this connection. Please wait a moment and try again." },
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
      return NextResponse.json({ error: "Enter a URL to scan." }, { status: 400 });
    }

    const page = await scrapePage(url);
    const result = await analyzePage(page);

    return NextResponse.json(result);
  } catch (err) {
    // UserError messages are written to be shown as-is. Anything else is
    // unexpected — log the real error server-side and return a generic
    // message so we never leak internal error text (SDK details, stack
    // fragments, etc.) to the client.
    if (err instanceof UserError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Unhandled error in /api/analyze:", err);
    return NextResponse.json(
      { error: "Something went wrong while scanning that page. Please try again." },
      { status: 500 }
    );
  }
}
