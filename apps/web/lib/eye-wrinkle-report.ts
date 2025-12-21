import type { PhotoRow } from "./recommendations";

type ReportItem = {
  id: string;
  title: string;
  description: string;
  comparison: string;
  status: "좋음" | "보통" | "주의";
};

type NeedEntry = {
  id: string;
  label: string;
  level: "high" | "medium";
  description: string;
};

type EyeWrinklePayload = {
  summary: string;
  highlight: string;
  items: ReportItem[];
  tips: string[];
  needs: NeedEntry[];
};

const WRINKLE_METRICS = [
  {
    id: "elasticity",
    label: "눈가 탄력",
    score: 92,
    status: "양호",
    detail: "눈 중간 부분이 안정적으로 치켜올라 있어 전반적인 탄력은 잘 유지되고 있어요.",
  },
  {
    id: "fineLines",
    label: "미세 주름",
    score: 68,
    status: "주의",
    detail: "눈꼬리에서 2~3줄 정도의 얕은 주름이 반복적으로 보이고 있어 꾸준한 보습이 필요해요.",
  },
  {
    id: "hydration",
    label: "수분도",
    score: 74,
    status: "주의",
    detail: "세안을 자주 하는 날엔 눈가가 쉽게 건조해질 수 있으니 크림 레이어링을 추가해 주세요.",
  },
];

const WRINKLE_TIPS = [
  "저녁 루틴에서는 아이크림을 두껍게 올린 뒤 5분 정도 흡수시키면 주름이 덜 눈에 띕니다.",
  "눈 주위 림프를 따라 가볍게 마사지하면 붓기와 주름이 함께 완화돼요.",
  "외출 전에는 자외선 차단제를 눈꼬리까지 꼼꼼히 바르세요.",
];

const selectStatus = (status: string): "좋음" | "보통" | "주의" => {
  if (status === "양호") {
    return "좋음";
  }
  if (status === "주의") {
    return "주의";
  }
  return "보통";
};

const buildNarrative = (): EyeWrinklePayload => {
  const atRisk = WRINKLE_METRICS.filter((metric) => metric.status === "주의");

  const summaryParts = [
    "눈을 뜬 상태와 감은 상태를 모두 촬영해 눈가 라인을 비교했어요.",
    atRisk.length
      ? "탄력은 안정적이지만 미세 주름·수분 컨디션이 동시에 감지되어 루틴 보강이 필요합니다."
      : "전체적인 눈가 텐션이 균일해 현재 루틴을 유지하면 좋을 시기예요.",
  ];

  const summary = summaryParts.join(" ");
  const highlight = atRisk.length
    ? "눈가 보습막과 결을 동시에 지켜주는 루틴을 우선 추천드려요."
    : "지금 상태를 유지할 수 있도록 기본 아이케어만 잘 챙겨주세요.";

  const items: ReportItem[] = WRINKLE_METRICS.map((metric) => ({
    id: metric.id,
    title: metric.label,
    description: metric.detail,
    comparison: `현재 지수 ${metric.score}점`,
    status: selectStatus(metric.status),
  }));

  const needs: NeedEntry[] = atRisk.length
    ? [
        {
          id: "hydration",
          label: "눈가 보습막",
          level: "high",
          description: "수분을 오래 지켜주는 크림 레이어링이 필요해요.",
        },
        {
          id: "elasticity",
          label: "아이존 탄력",
          level: "medium",
          description: "얕은 주름이 반복되므로 리프팅 케어를 병행해 주세요.",
        },
      ]
    : [
        {
          id: "hydration",
          label: "눈가 보습 유지",
          level: "medium",
          description: "기존 루틴을 유지하면서 얇은 수분막만 보강하면 충분합니다.",
        },
      ];

  return {
    summary,
    highlight,
    items,
    tips: WRINKLE_TIPS,
    needs,
  };
};

const pickThumbnail = (photos: PhotoRow[]) => {
  if (!photos.length) return null;
  const sorted = [...photos].sort((a, b) => {
    const left = a.created_at ? Date.parse(a.created_at) : 0;
    const right = b.created_at ? Date.parse(b.created_at) : 0;
    return right - left;
  });
  const preferred = sorted.find((photo) => {
    const key = `${photo.focus_area ?? photo.shot_type ?? ""}`.toLowerCase();
    return key.includes("cheek") || key.includes("closed");
  });
  if (preferred?.image_url) {
    return preferred.image_url;
  }
  const fallback = sorted.find((photo) => photo.image_url);
  return fallback?.image_url ?? null;
};

export const buildEyeWrinkleArchiveEntry = (sessionId: string, createdAt: string | null, photos: PhotoRow[]) => {
  const narrative = buildNarrative();
  return {
    id: sessionId,
    createdAt,
    summary: narrative.summary,
    headline: narrative.highlight,
    thumbnail: pickThumbnail(photos),
  };
};

export const buildEyeWrinkleDetailPayload = ({
  sessionId,
  createdAt,
  photos,
}: {
  sessionId: string;
  createdAt: string | null;
  photos: PhotoRow[];
}) => {
  const narrative = buildNarrative();
  return {
    type: "eye_wrinkle" as const,
    sessionId,
    createdAt,
    thumbnail: pickThumbnail(photos),
    summary: narrative.summary,
    highlight: narrative.highlight,
    items: narrative.items,
    tips: narrative.tips,
    needs: narrative.needs,
    recommendations: [] as never[],
  };
};
