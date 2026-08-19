export type FactorKey =
  | "statistics"
  | "citations"
  | "quotes"
  | "fluency"
  | "entityClarity";

export interface Factor {
  key: FactorKey;
  label: string;
  score: number; // 0-100
  finding: string;
  evidence: string[]; // short verbatim-free excerpts/paraphrases found on the page
  researchNote: string;
}

export interface Penalty {
  label: string;
  detected: boolean;
  note: string;
}

export interface AnalysisResult {
  url: string;
  title: string;
  overallScore: number; // 0-100 — this is a MODELED prediction, not an observation
  summary: string;
  factors: Factor[];
  penalties: Penalty[];
  llmsTxt: string;
  wordCount: number;
  scannedAt: string;
}

// --- Live search probe (MEASURED, not modeled) ---

export type QueryIntent =
  | "awareness"
  | "comparison"
  | "pricing"
  | "alternative"
  | "usecase";

export interface ProbeQuestion {
  id: string;
  question: string;
  intent: QueryIntent;
}

export interface ProbeOutcome {
  questionId: string;
  question: string;
  intent: QueryIntent;
  retrieved: boolean; // did the target domain show up in search results?
  cited: boolean; // did Claude actually cite the target domain in its answer?
  citedSources: string[]; // other domains Claude cited for this question (excludes target)
  errored?: boolean; // this single probe failed — outcome is not meaningful
}

export interface ProbeResponse {
  targetDomain: string;
  outcomes: ProbeOutcome[];
  retrievedCount: number;
  citedCount: number;
  totalCount: number;
  probedAt: string;
}
