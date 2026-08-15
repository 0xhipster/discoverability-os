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
  overallScore: number; // 0-100
  summary: string;
  factors: Factor[];
  penalties: Penalty[];
  llmsTxt: string;
  wordCount: number;
  scannedAt: string;
}
