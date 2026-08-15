import * as cheerio from "cheerio";
import { UserError } from "./errors";
import { assertPublicHostname } from "./ssrf-guard";

export interface ScrapedPage {
  url: string;
  title: string;
  text: string;
  wordCount: number;
}

const STRIP_SELECTORS = [
  "script",
  "style",
  "noscript",
  "nav",
  "footer",
  "header",
  "svg",
  "form",
  "iframe",
  "[aria-hidden='true']",
];

const FETCH_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB — plenty for HTML, caps memory/cost on huge or hostile responses

/**
 * Fetches a URL, manually following redirects (rather than letting the
 * runtime auto-follow them) so each hop's hostname is re-validated against
 * the SSRF guard before we connect. Without this, an attacker could point
 * at an allowed public URL that 302s to an internal address and bypass a
 * check that only ran once, on the original URL.
 */
async function fetchWithGuards(startUrl: URL): Promise<{ res: Response; finalUrl: URL }> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHostname(current.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(current.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; DiscoverabilityOS/0.1; +https://discoverability-score.vercel.app)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch {
      throw new UserError(
        "Couldn't reach that URL. It may be blocking scrapers, require a login, or be unreachable."
      );
    } finally {
      clearTimeout(timeout);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new UserError("That URL redirected without a destination.");
      }
      const next = new URL(location, current);
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw new UserError("That URL redirected to an unsupported protocol.");
      }
      current = next;
      continue; // loop re-validates the new host before following it
    }

    return { res, finalUrl: current };
  }

  throw new UserError("Too many redirects.");
}

async function readBodyWithCap(res: Response): Promise<string> {
  const declaredLength = res.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_RESPONSE_BYTES) {
    throw new UserError("That page is too large to scan.");
  }

  if (!res.body) {
    return res.text();
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new UserError("That page is too large to scan.");
      }
      chunks.push(value);
    }
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}

export async function scrapePage(rawUrl: string): Promise<ScrapedPage> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UserError("That doesn't look like a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UserError("Only http:// and https:// URLs are supported.");
  }

  const { res, finalUrl } = await fetchWithGuards(parsed);

  if (!res.ok) {
    throw new UserError(`The page responded with status ${res.status}.`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new UserError("That URL didn't return an HTML page.");
  }

  const html = await readBodyWithCap(res);
  const $ = cheerio.load(html);

  STRIP_SELECTORS.forEach((sel) => $(sel).remove());

  const title = $("title").first().text().trim() || finalUrl.hostname;

  const blocks: string[] = [];
  $("h1, h2, h3, h4, p, li, blockquote, td, th, figcaption").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > 1) blocks.push(t);
  });

  const text = blocks.join("\n").trim();

  if (text.length < 40) {
    throw new UserError(
      "Couldn't find enough readable text on that page. It may be rendered entirely with JavaScript, which this MVP doesn't execute."
    );
  }

  // Cap so we don't blow past model context / cost on huge pages
  const MAX_CHARS = 12000;
  const clipped = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;

  return {
    url: finalUrl.toString(),
    title,
    text: clipped,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}
