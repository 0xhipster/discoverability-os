# DiscoverabilityOS

Scores any web page for how likely it is to be extracted, quoted, and cited by AI answer engines (Claude, ChatGPT, Perplexity), based on the factors identified in Princeton's GEO-bench study ("GEO: Generative Engine Optimization," Aggarwal et al., KDD 2024). Outputs a downloadable `llms.txt` file.

**How it works:** paste a URL → the app scrapes the page's visible text → Claude scores it against five research-backed factors (statistics, citations, quotes, fluency, entity clarity) → you get a score, per-factor findings, and a ready-to-publish `llms.txt`.

## Stack

- Next.js 14 (App Router) — frontend + API route in one deployable project
- Anthropic API (`@anthropic-ai/sdk`) — does the scoring
- Cheerio — server-side HTML parsing
- Tailwind CSS

No separate backend, no database. Everything runs as a single Vercel deployment.

## Run locally

```bash
npm install
cp .env.example .env.local   # then paste your Anthropic API key into .env.local
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

1. Push this folder to a new GitHub repo.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo. Vercel auto-detects Next.js — no config needed.
3. In the project's **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your key from [console.anthropic.com](https://console.anthropic.com)
4. Deploy. You'll get a `your-project.vercel.app` URL.

## Deploy to Netlify

Netlify also supports Next.js App Router out of the box via its Next.js runtime.

1. Push to GitHub, then "Add new site → Import an existing project" in Netlify.
2. Build command: `next build`. Publish directory: leave default (Netlify's Next.js plugin handles it).
3. Add the `ANTHROPIC_API_KEY` environment variable in **Site configuration → Environment variables**.
4. Deploy.

## Known MVP limitations (worth knowing before you demo this)

- **JavaScript-rendered pages won't scrape.** The scraper fetches raw HTML — it doesn't run a headless browser. Pages that render their content client-side (many React/Vue marketing sites) will fail with a clear error message rather than silently returning nothing.
- **Scoring is a heuristic, not ground truth.** No AI vendor publishes what actually gets cited, so the score reflects Claude's judgment against GEO-bench's published factors — a strong, research-backed proxy, not a guarantee.
- **Single-page scans only.** No crawling, no site-wide audits, no history/accounts yet — intentionally, to keep the MVP scope tight.

## Next steps (not built yet)

- Content rewrite generator (Module 3 from the original product plan)
- JSON-LD schema builder
- Scan history via a database (Supabase)
- GA4 / server-log integration to correlate AI crawler hits with actual traffic
