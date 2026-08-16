# Discoverability OS — GEO Audit

> Scores web pages for AI engine discoverability (Claude, ChatGPT, Perplexity) based on Princeton's GEO-bench research and outputs a ready-to-publish `llms.txt` file.

🔗 **Live Demo:** [discoverability-score.vercel.app](https://discoverability-score.vercel.app)

---

## Overview

Discoverability OS evaluates how likely a web page is to be extracted, quoted, and cited by AI answer engines. It uses factors identified in Princeton's GEO-bench study (*"GEO: Generative Engine Optimization,"* Aggarwal et al., KDD 2024).

### How It Works

1. **Paste a URL** — The app scrapes the visible text of the target web page.
2. **AI Analysis** — Claude scores the page against factors drawn from GEO-bench:
   - Statistics & Numerical Data (Statistics Addition)
   - Citations & Sources (Cite Sources)
   - Direct Quotes (Quotation Addition)
   - Fluency (Fluency Optimization)
   - Authority (Authoritative)
3. **Instant Output** — You receive a score breakdown, per-factor findings, and a downloadable `llms.txt` file ready for AI crawlers.

---

## Tech Stack

- **Framework:** [Next.js 14](https://nextjs.org/) (App Router)
- **AI Model:** Anthropic Claude API (`@anthropic-ai/sdk`)
- **Scraper:** [Cheerio](https://cheerio.js.org/) (Server-side HTML parsing)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Deployment:** [Vercel](https://vercel.com/)

---

## Getting Started Locally

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### 1. Clone the repository

```bash
git clone https://github.com/0xhipster/discoverability-os.git
cd discoverability-os
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Duplicate the `.env.example` file in the root directory and rename the copy to `.env.local`. Open it and add your secret Anthropic API key:

```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the result.

---

## Deployment (Vercel)

This app is designed to be deployed on Vercel with zero configuration.

1. Log in to Vercel and import this GitHub repository.
2. Before clicking deploy, open the Environment Variables section.
3. Add a new variable:
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** your actual API key
4. Click **Deploy**.

---

## Known Limitations

- **JavaScript-Rendered Pages:** The scraper fetches raw HTML. Client-rendered single-page applications (like some React/Vue sites) will fail with a clear error message because there is no headless browser attached.
- **Heuristic Scoring:** Scores reflect Claude's evaluation against GEO-bench factors as a research-backed proxy. No AI vendor publishes their exact ranking algorithms.
- **Single-Page Scans:** Scans are performed on individual URLs rather than full-site crawls to keep the MVP scope tight.

---

## Roadmap

- [ ] Content rewrite generator (Module 3)
- [ ] Automated JSON-LD schema generation
- [ ] Scan history and project workspaces via Supabase
- [ ] Crawler traffic analytics (GA4/Server log integration)

---

## License

<!-- TODO: no LICENSE file currently exists in this repo. Pick one (MIT is the common default for
     open MVPs like this) and add a corresponding LICENSE file at the repo root, e.g.:
     https://choosealicense.com/licenses/mit/ -->

No license has been specified yet — until one is added, this code defaults to all-rights-reserved and isn't legally reusable despite being public.

## Author

Built by [@0xhipster](https://github.com/0xhipster). Open for contributions and feedback! :)
