export type ReportItem = {
  id: string;
  title: string;
  description: string;
  comparison: string;
  status: "좋음" | "보통" | "주의";
};

export type NeedEntry = {
  id: string;
  label: string;
  level: "high" | "medium";
  description: string;
};

export type ProductRecommendation = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  reason: string;
  focus: string[];
  keyIngredients: string[];
  note?: string | null;
  imageUrl?: string | null;
};
