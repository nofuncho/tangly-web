export type AiKeyFindingStatus = "good" | "neutral" | "caution";
export type AiFocusTopic =
  | "hydration"
  | "elasticity"
  | "wrinkle"
  | "radiance"
  | "trouble";
export type AiActionFrequency = "daily" | "weekly" | "three_per_week";

export type AiReportContent = {
  oneLiner: string;
  summary: string[];
  keyFindings: {
    title: string;
    status: AiKeyFindingStatus;
    description: string;
  }[];
  ageComparison: {
    percentile: number;
    statement: string;
  };
  focus: {
    topic: AiFocusTopic;
    reason: string;
  };
  actions: {
    title: string;
    description: string;
    frequency: AiActionFrequency;
  }[];
  warnings: string[];
};

export type AiReportEnvelope = {
  status: "ready" | "unavailable" | "error";
  payload?: AiReportContent | null;
  generatedAt?: string | null;
  error?: string | null;
};
