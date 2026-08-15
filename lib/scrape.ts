import * as cheerio from "cheerio";

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

export async function scrapePage(rawUrl: string): Promise<ScrapedPage> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; DiscoverabilityOS/0.1; +https://discoverability-os.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (err) {
    throw new Error(
      "Couldn't reach that URL. It may be blocking scrapers, require a login, or render its content with JavaScript only."
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`The page responded with status ${res.status}.`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error("That URL didn't return an HTML page.");
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  STRIP_SELECTORS.forEach((sel) => $(sel).remove());

  const title = $("title").first().text().trim() || parsed.hostname;

  const blocks: string[] = [];
  $("h1, h2, h3, h4, p, li, blockquote, td, th, figcaption").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > 1) blocks.push(t);
  });

  const text = blocks.join("\n").trim();

  if (text.length < 40) {
    throw new Error(
      "Couldn't find enough readable text on that page. It may be rendered entirely with JavaScript, which this MVP doesn't execute."
    );
  }

  // Cap so we don't blow past model context / cost on huge pages
  const MAX_CHARS = 12000;
  const clipped = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;

  return {
    url: parsed.toString(),
    title,
    text: clipped,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}
