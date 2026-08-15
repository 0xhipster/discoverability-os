import { NextRequest, NextResponse } from "next/server";
import { scrapePage } from "@/lib/scrape";
import { analyzePage } from "@/lib/scoring";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = typeof body?.url === "string" ? body.url : "";

    if (!url || url.trim().length === 0) {
      return NextResponse.json({ error: "Enter a URL to scan." }, { status: 400 });
    }

    const page = await scrapePage(url);
    const result = await analyzePage(page);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
