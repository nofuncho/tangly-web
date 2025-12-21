export type PhotoRow = {
  id: string;
  session_id?: string | null;
  shot_type?: string | null;
  focus_area?: string | null;
  image_url?: string | null;
  image_path?: string | null;
  created_at?: string | null;
};

export type OxResponseRow = {
  session_id?: string | null;
  user_id?: string | null;
  question_key: string;
  answer: string;
  created_at?: string | null;
};

export type ProductRow = {
  id: string;
  name?: string | null;
  brand?: string | null;
  category?: string | null;
  effect_tags?: string[] | string | null;
  key_ingredients?: string[] | string | null;
  note?: string | null;
  image_url?: string | null;
  title?: string | null;
};

export type NeedLevel = "high" | "medium";

export type NeedTag =
  | "hydration"
  | "elasticity"
  | "barrier"
  | "soothing"
  | "radiance"
  | "pore_care"
  | "sebum_control";

export type NeedEntry = {
  id: NeedTag;
  label: string;
  level: NeedLevel;
  description: string;
  reasons: string[];
};

export type ReportItem = {
  id: string;
  title: string;
  description: string;
  comparison: string;
  status: "좋음" | "보통" | "주의";
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

export type RecommendationPayload = {
  sessionLabel: string;
  summary: string;
  highlight: string;
  items: ReportItem[];
  tips: string[];
  needs: NeedEntry[];
  recommendations: ProductRecommendation[];
};

type NeedDefinition = {
  label: string;
  description: string;
  synonyms: string[];
  categories: string[];
  tip: string;
};

const NEED_DEFINITIONS: Record<NeedTag, NeedDefinition> = {
  hydration: {
    label: "수분 밀도",
    description: "촬영된 볼 피부가 균일하게 보이도록 충분한 보습막을 유지해야 해요.",
    synonyms: ["hydration", "moisture", "moisturizing", "water", "dew", "수분", "보습"],
    categories: ["toner", "essence", "serum", "ampoule", "cream", "mask"],
    tip: "세안 직후 토너와 세럼으로 빠르게 수분을 채운 후 크림으로 잠그면 밀도가 올라갑니다.",
  },
  elasticity: {
    label: "탄력",
    description: "턱선과 볼 윤곽을 지탱하는 힘을 보완하면 전체 실루엣이 또렷해집니다.",
    synonyms: ["elasticity", "firm", "lifting", "tightening", "탄력", "리프팅"],
    categories: ["serum", "ampoule", "cream", "mask", "eye"],
    tip: "저녁 루틴에 탄력 세럼을 추가하고 귀밑 림프를 부드럽게 마사지해 주세요.",
  },
  barrier: {
    label: "장벽 강화",
    description: "예민함이 느껴질 때는 장벽을 복구해 변동을 막는 것이 우선입니다.",
    synonyms: ["barrier", "repair", "recovery", "장벽", "보호"],
    categories: ["cream", "ampoule", "balm"],
    tip: "세라마이드나 판테놀 계열 크림으로 보습막을 두껍게 올려 주세요.",
  },
  soothing: {
    label: "진정",
    description: "열감을 빠르게 내려야 요철과 붉은기 악화를 막을 수 있어요.",
    synonyms: ["soothing", "calming", "relief", "진정", "쿨링"],
    categories: ["toner", "ampoule", "mask"],
    tip: "녹차·시카 계열 앰플을 냉장 보관했다가 열감이 느껴질 때 얹어 주세요.",
  },
  radiance: {
    label: "톤 개선",
    description: "자외선 관리가 느슨하면 피부가 칙칙해지기 쉬워요.",
    synonyms: ["radiance", "brightening", "tone", "glow", "미백", "톤"],
    categories: ["toner", "serum", "ampoule", "sunscreen"],
    tip: "아침 루틴에 광채 세럼을 넣고, 2~3시간 간격으로 선크림을 덧바르세요.",
  },
  pore_care: {
    label: "모공 관리",
    description: "메이크업과 피지가 겹치면 모공 윤곽이 쉽게 벌어집니다.",
    synonyms: ["pore", "clarify", "clean", "모공", "각질"],
    categories: ["toner", "serum", "ampoule", "mask"],
    tip: "주 2회 정도 부드러운 각질 제거 후 수분팩으로 진정시켜 주세요.",
  },
  sebum_control: {
    label: "피지 밸런스",
    description: "유분이 높게 유지되면 결이 두꺼워지고 광택이 번들거립니다.",
    synonyms: ["sebum", "oil", "balance", "유분", "피지", "지성"],
    categories: ["toner", "emulsion", "serum", "gel", "mask"],
    tip: "과도한 파우더 대신 수분 앰플로 유수분 밸런스를 맞춰 주세요.",
  },
};

type NeedScoreEntry = { id: NeedTag; score: number; reasons: string[] };

type AnalysisContext = {
  hasBase: boolean;
  hasCheek: boolean;
  photoCount: number;
  oxMap: Record<string, "O" | "X">;
  needScores: Map<NeedTag, NeedScoreEntry>;
};

const toArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => `${item}`.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeTag = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g, "_");

const ensureNeedEntry = (map: Map<NeedTag, NeedScoreEntry>, id: NeedTag) => {
  if (!map.has(id)) {
    map.set(id, { id, score: 0, reasons: [] });
  }
  return map.get(id)!;
};

const bumpNeed = (
  map: Map<NeedTag, NeedScoreEntry>,
  id: NeedTag,
  weight: number,
  reason?: string
) => {
  const entry = ensureNeedEntry(map, id);
  entry.score += weight;
  if (reason) {
    entry.reasons.push(reason);
  }
};

const deriveContext = (photos: PhotoRow[], oxResponses: OxResponseRow[]): AnalysisContext => {
  const oxMap: Record<string, "O" | "X"> = {};
  oxResponses.forEach((response) => {
    const value = response.answer?.toUpperCase();
    if (value === "O" || value === "X") {
      oxMap[response.question_key] = value;
    }
  });

  const hasBase = photos.some((photo) =>
    (photo.shot_type ?? "").toLowerCase() === "base"
  );
  const hasCheek = photos.some((photo) =>
    (photo.shot_type ?? photo.focus_area ?? "").toLowerCase().includes("cheek")
  );

  const needScores = new Map<NeedTag, NeedScoreEntry>();

  if (!hasBase) {
    bumpNeed(needScores, "elasticity", 1.5, "기준 촬영이 부족해 탄력 지표를 보완할 필요가 있어요.");
  }
  if (!hasCheek) {
    bumpNeed(needScores, "hydration", 1, "볼 클로즈업 데이터가 부족해 결이 건조하게 읽혔어요.");
  }

  if (oxMap["sensitive_skin"] === "O") {
    bumpNeed(needScores, "soothing", 2, "예민함을 느낀다고 응답했습니다.");
    bumpNeed(needScores, "barrier", 1, "예민 피부는 장벽 복구가 핵심이에요.");
  }

  if (oxMap["recent_skin_trouble"] === "O") {
    bumpNeed(needScores, "soothing", 1.5, "최근 트러블이 있다고 답했습니다.");
  }

  if (oxMap["daily_sunscreen"] !== "O") {
    bumpNeed(needScores, "radiance", 2, "자외선 차단을 자주 하지 않는다고 답했습니다.");
    bumpNeed(needScores, "elasticity", 0.5, "자외선 누적으로 탄력 저하가 빨라질 수 있어요.");
  }

  if (oxMap["frequent_makeup"] === "O") {
    bumpNeed(needScores, "pore_care", 2, "메이크업 빈도가 높아 모공 관리가 필요합니다.");
  }

  if (oxMap["oiliness_high"] === "O") {
    bumpNeed(needScores, "sebum_control", 2, "유분이 많다고 응답했습니다.");
    bumpNeed(needScores, "pore_care", 1, "피지 누적으로 모공이 넓어질 수 있어요.");
  } else {
    bumpNeed(needScores, "hydration", 0.5, "유분 걱정이 낮아 수분 레이어링에 집중할 수 있어요.");
  }

  if (oxMap["sleep_irregular"] === "O") {
    bumpNeed(needScores, "elasticity", 1, "수면 부족은 탄력 회복을 더디게 만들어요.");
    bumpNeed(needScores, "hydration", 0.5, "불규칙한 수면은 수분 순환에도 영향을 줍니다.");
  }

  if (oxMap["stress_high"] === "O") {
    bumpNeed(needScores, "barrier", 1.5, "스트레스로 장벽이 불안정해질 수 있어요.");
    bumpNeed(needScores, "soothing", 1, "예민함 대비 진정 루틴을 강화해야 해요.");
  }

  if (oxMap["water_intake_low"] === "O") {
    bumpNeed(needScores, "hydration", 1.5, "체내 수분이 부족해 결이 거칠어질 수 있어요.");
  }

  if (oxMap["touch_face_often"] === "O") {
    bumpNeed(needScores, "soothing", 0.5, "얼굴을 자주 만지면 미세 자극이 누적돼요.");
    bumpNeed(needScores, "pore_care", 0.5, "손의 유분이 모공을 막을 수 있어요.");
  }

  return {
    hasBase,
    hasCheek,
    photoCount: photos.length,
    oxMap,
    needScores,
  };
};

const weightToLevel = (score: number): NeedLevel => (score >= 2 ? "high" : "medium");

const buildNarrative = (
  context: AnalysisContext
): {
  needs: NeedEntry[];
  summary: string;
  highlight: string;
  items: ReportItem[];
  tips: string[];
} => {
  const sortedNeeds = Array.from(context.needScores.values()).sort(
    (a, b) => b.score - a.score
  );
  if (!sortedNeeds.length) {
    sortedNeeds.push({ id: "hydration", score: 1, reasons: [] });
  }

  const prioritized = sortedNeeds.slice(0, 3).map((entry) => ({
    id: entry.id,
    label: NEED_DEFINITIONS[entry.id].label,
    level: weightToLevel(entry.score),
    description: NEED_DEFINITIONS[entry.id].description,
    reasons: entry.reasons,
  }));

  const summaryParts: string[] = [];
  summaryParts.push(
    context.hasBase
      ? "기준 얼굴 촬영으로 전체 윤곽과 톤을 안정적으로 읽을 수 있었어요."
      : "기준 촬영이 부족해 톤 해석은 보수적으로 진행됐어요."
  );
  summaryParts.push(
    context.hasCheek
      ? "볼 클로즈업 데이터 덕분에 결과 모공 변화를 명확히 확인했습니다."
      : "볼 촬영이 아쉬워 결 정보를 주관적인 응답으로 보완했어요."
  );
  if (context.oxMap["recent_skin_trouble"] === "O") {
    summaryParts.push("최근 트러블 응답을 반영해 자극 케어 항목을 우선 배치했습니다.");
  }

  const summary = summaryParts.join(" ");

  const topNeed = prioritized[0];
  const highlight = topNeed
    ? `${topNeed.label} 케어가 이번 세션의 최우선 과제로 감지됐어요.`
    : "큰 이상 징후는 없지만 기본 루틴을 유지해 주세요.";

  const tips = prioritized
    .map((entry) => NEED_DEFINITIONS[entry.id].tip)
    .slice(0, 3);

  if (context.oxMap["daily_sunscreen"] !== "O") {
    tips.push("외출 15분 전에 선크림을 도포하고, 야외 활동 시 2시간 간격으로 덧바르면 톤 손실을 줄일 수 있어요.");
  }

  const scoreFor = (tag: NeedTag) => context.needScores.get(tag)?.score ?? 0;

  const items: ReportItem[] = [
    {
      id: "hydration",
      title: "수분 밀도",
      description:
        scoreFor("hydration") >= 1
          ? "볼 데이터와 생활 습관을 기준으로 수분 보강이 필요해요."
          : "현재로선 수분 밸런스가 크게 흐트러지지 않았어요.",
      comparison:
        scoreFor("hydration") >= 1
          ? "동연령 대비 보습 유지력이 다소 낮을 수 있어요."
          : "평균 대비 안정적인 편이에요.",
      status: scoreFor("hydration") >= 2 ? "주의" : scoreFor("hydration") >= 1 ? "보통" : "좋음",
    },
    {
      id: "elasticity",
      title: "탄력",
      description:
        scoreFor("elasticity") >= 1
          ? "턱선과 볼 라인이 쉽게 흐를 수 있어 탄력 세럼을 추천합니다."
          : "탄력 지표는 큰 하락 없이 유지되고 있어요.",
      comparison:
        scoreFor("elasticity") >= 1
          ? "전반적인 리프팅 지표가 평균보다 느슨하게 읽혔어요."
          : "동연령 대비 비슷한 수준이에요.",
      status:
        scoreFor("elasticity") >= 2 ? "주의" : scoreFor("elasticity") >= 1 ? "보통" : "좋음",
    },
    {
      id: "barrier",
      title: "장벽",
      description:
        scoreFor("barrier") >= 1
          ? "예민 응답으로 인해 장벽 복구 제품을 우선 고려했습니다."
          : "큰 자극 신호가 없어 기본 보습만으로도 충분해 보여요.",
      comparison:
        scoreFor("barrier") >= 1
          ? "건조/자극 요인에 취약할 수 있어요."
          : "환경 변화에도 비교적 안정적인 편이에요.",
      status:
        scoreFor("barrier") >= 2 ? "주의" : scoreFor("barrier") >= 1 ? "보통" : "좋음",
    },
    {
      id: "radiance",
      title: "톤 균형",
      description:
        scoreFor("radiance") >= 1
          ? "자외선 응답을 기준으로 광채가 쉽게 떨어질 수 있습니다."
          : "광채 밸런스가 안정적으로 유지되고 있어요.",
      comparison:
        scoreFor("radiance") >= 1
          ? "차단 루틴을 강화하면 톤 저하를 늦출 수 있어요."
          : "평균 대비 특별한 이슈가 없어요.",
      status:
        scoreFor("radiance") >= 2 ? "주의" : scoreFor("radiance") >= 1 ? "보통" : "좋음",
    },
    {
      id: "pore",
      title: "모공·피지",
      description:
        scoreFor("pore_care") + scoreFor("sebum_control") >= 1
          ? "모공/피지 항목이 강조되어 가벼운 각질 케어가 권장됩니다."
          : "현재 모공은 안정적으로 보입니다.",
      comparison:
        scoreFor("pore_care") + scoreFor("sebum_control") >= 1
          ? "메이크업/유분 요인으로 넓어질 수 있으니 주의해 주세요."
          : "평균 대비 크게 벌어지지 않았어요.",
      status:
        scoreFor("pore_care") + scoreFor("sebum_control") >= 2
          ? "주의"
          : scoreFor("pore_care") + scoreFor("sebum_control") >= 1
            ? "보통"
            : "좋음",
    },
  ];

  return { needs: prioritized, summary, highlight, items, tips };
};

const pickRecommendations = (
  products: ProductRow[],
  needs: NeedEntry[],
  context: AnalysisContext
): ProductRecommendation[] => {
  if (!products.length || !needs.length) {
    return [];
  }

  const needOrder = new Map<NeedTag, number>();
  needs.forEach((need, idx) => needOrder.set(need.id, idx));

  const scored = products
    .map((product) => {
      const normalizedCategory = normalizeTag(product.category ?? "");
      const effectTags = toArray(product.effect_tags).map(normalizeTag);
      let bestNeed: NeedTag | null = null;
      let score = 0;

      needs.forEach((need) => {
        const synonyms = NEED_DEFINITIONS[need.id].synonyms.map(normalizeTag);
        const hasTagMatch = effectTags.some((tag) => synonyms.includes(tag));
        if (hasTagMatch) {
          const priorityWeight = needs.length - (needOrder.get(need.id) ?? 0);
          const categoryBonus = NEED_DEFINITIONS[need.id].categories.some((cat) =>
            normalizedCategory.includes(cat)
          )
            ? 1.2
            : 0;
          const candidateScore = priorityWeight * 1.5 + categoryBonus;
          if (candidateScore > score) {
            score = candidateScore;
            bestNeed = need.id;
          }
        }
      });

      if (!bestNeed) {
        return null;
      }

      const ingredientBonus = toArray(product.key_ingredients).length ? 0.3 : 0;
      return {
        product,
        score: score + ingredientBonus,
        need: bestNeed,
      };
    })
    .filter((entry): entry is { product: ProductRow; score: number; need: NeedTag } => Boolean(entry))
    .sort((a, b) => b.score - a.score);

  const deduped: ProductRecommendation[] = [];
  const seen = new Set<string>();

  for (const entry of scored) {
    const id = entry.product.id;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const needDefinition = NEED_DEFINITIONS[entry.need];
    const productName = entry.product.name ?? entry.product.title ?? "추천 제품";
    const keyIngredients = toArray(entry.product.key_ingredients).slice(0, 4);
    const reason = buildRecommendationReason(entry.need, context);

    deduped.push({
      id,
      name: productName,
      brand: entry.product.brand ?? null,
      category: entry.product.category ?? null,
      reason,
      focus: [needDefinition.label],
      keyIngredients,
      note: entry.product.note ?? null,
      imageUrl: entry.product.image_url ?? null,
    });

    // continue collecting beyond 3 to provide a richer list
  }

  return deduped;
};

const buildRecommendationReason = (need: NeedTag, context: AnalysisContext): string => {
  const entry = context.needScores.get(need);
  if (entry?.reasons.length) {
    return entry.reasons[0];
  }

  switch (need) {
    case "hydration":
      return "볼 피부 결이 건조하게 읽혀 수분 레이어링을 권장합니다.";
    case "elasticity":
      return "턱선 탄력이 쉽게 흐를 수 있어 리프팅 케어를 제안해요.";
    case "barrier":
      return "예민 신호를 최소화하기 위해 장벽 복구 루틴이 필요합니다.";
    case "soothing":
      return "열감/트러블 응답을 고려해 진정 제품을 추천합니다.";
    case "radiance":
      return "톤 저하를 늦추기 위해 광채/미백 기능을 우선 연결합니다.";
    case "pore_care":
      return "피지와 메이크업 누적으로 모공이 넓어질 수 있어요.";
    case "sebum_control":
      return "유분 밸런스를 맞춰야 결이 균일해질 수 있습니다.";
    default:
      return "이번 세션의 우선 과제를 기반으로 선택했습니다.";
  }
};

export const buildRecommendationPayload = ({
  sessionId,
  photos,
  oxResponses,
  products,
}: {
  sessionId: string;
  photos: PhotoRow[];
  oxResponses: OxResponseRow[];
  products: ProductRow[];
}): RecommendationPayload => {
  const context = deriveContext(photos, oxResponses);
  const { needs, summary, highlight, items, tips } = buildNarrative(context);
  const recommendations = pickRecommendations(products, needs, context);

  return {
    sessionLabel: sessionId,
    summary,
    highlight,
    items,
    tips,
    needs,
    recommendations,
  };
};
