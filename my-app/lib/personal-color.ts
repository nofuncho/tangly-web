import {
  type NeedEntry,
  type ProductRecommendation,
  type ReportItem,
} from "@/types/report";

export type PersonalColorInputs = {
  tone: number; // 0 ~ 1, 0은 쿨·1은 웜
  depth: number; // 0은 밝음·1은 딥
  clarity: number; // 0은 소프트·1은 비비드
};

export type PersonalColorSliderDetail = {
  id: keyof PersonalColorInputs;
  label: string;
  leftLabel: string;
  rightLabel: string;
  value: number;
};

export type PersonalColorExtras = {
  toneLabel: string;
  palette: string[];
  storyline: string[];
  sliderDetails: PersonalColorSliderDetail[];
};

export type PersonalColorResult = {
  sessionLabel: string;
  summary: string;
  highlight: string;
  items: ReportItem[];
  tips: string[];
  needs: NeedEntry[];
  recommendations: ProductRecommendation[];
  extras: PersonalColorExtras;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const describeSide = (value: number, left: string, right: string) => {
  if (value >= 0.6) return right;
  if (value <= 0.4) return left;
  return "중간";
};

const paletteByTone: Record<string, string[]> = {
  "봄 웜 라이트": ["#FFE3D5", "#FFC4C7", "#FFAEA2", "#F281A7"],
  "봄 웜 브라이트": ["#FFD7C2", "#FFAC9F", "#FF7BA5", "#FF4E88"],
  "가을 웜 소프트": ["#F4C0A5", "#D78973", "#C26A5A", "#A64B3F"],
  "여름 쿨 소프트": ["#E1D4F7", "#C9B6F2", "#9D8BC9", "#6D5B9E"],
  "겨울 쿨 브라이트": ["#D4D8FF", "#B4B8FF", "#858BFF", "#4F54D8"],
  "겨울 쿨 딥": ["#C8CCF5", "#8D95D3", "#5960BA", "#2E2F7C"],
  "뉴트럴 클래식": ["#F3DADF", "#E4C2CF", "#D3ADB9", "#B48F9D"],
};

const storylineCopy = (toneLabel: string, toneSide: string, depthSide: string, claritySide: string) => [
  `톤 질문에서는 ${toneSide === "중간" ? "뉴트럴" : toneSide} 느낌이 가장 자연스럽다고 답하셨습니다.`,
  `밝기 단계에서는 ${depthSide === "중간" ? "과하지 않은 톤" : depthSide === "밝음" ? "밝게 정돈된 쪽" : "살짝 깊이 있는 쪽"}으로 기울었어요.`,
  `마지막 단계에서는 ${claritySide === "중간" ? "부드러운 광" : claritySide} 표현이 더 안정적이라는 응답이었습니다.`,
  `${toneLabel} 계열을 기준으로 베이스와 색조를 골라드릴게요.`,
];

const deriveToneLabel = (toneScore: number, depthScore: number, clarityScore: number) => {
  const warmLean = toneScore >= 0.55;
  const coolLean = toneScore <= 0.45;
  if (warmLean) {
    if (depthScore <= 0.45) return "봄 웜 라이트";
    if (clarityScore >= 0.55) return "봄 웜 브라이트";
    return "가을 웜 소프트";
  }
  if (coolLean) {
    if (depthScore >= 0.6) return "겨울 쿨 딥";
    if (clarityScore >= 0.55) return "겨울 쿨 브라이트";
    return "여름 쿨 소프트";
  }
  if (depthScore >= 0.6) {
    return "겨울 쿨 딥";
  }
  if (depthScore <= 0.4) {
    return "여름 쿨 소프트";
  }
  return "뉴트럴 클래식";
};

export const computePersonalColorResult = (inputs: PersonalColorInputs): PersonalColorResult => {
  const toneScore = clamp01(inputs.tone ?? 0.5);
  const depthScore = clamp01(inputs.depth ?? 0.5);
  const clarityScore = clamp01(inputs.clarity ?? 0.5);

  const toneSide = describeSide(toneScore, "쿨", "웜");
  const depthSide = describeSide(depthScore, "밝음", "딥");
  const claritySide = describeSide(clarityScore, "소프트", "선명");

  const toneLabel = deriveToneLabel(toneScore, depthScore, clarityScore);
  const sessionLabel = `퍼스널컬러 · ${toneLabel}`;
  const summary = `전체적인 인상은 ${toneLabel}에 가장 가깝습니다. 과한 대비보다는 ${claritySide === "선명" ? "선명함을 살려줄" : claritySide === "소프트" ? "부드럽게 톤을 덮어줄" : "은은하게 경계를 정리하는"} 루틴이 잘 어울리는 상태예요.`;
  const highlight = `${toneLabel} 무드가 지금 얼굴의 혈색과 가장 잘 맞습니다.`;

  const sliderDetails: PersonalColorExtras["sliderDetails"] = [
    {
      id: "tone",
      label: "Warm / Cool",
      leftLabel: "Cool",
      rightLabel: "Warm",
      value: toneScore,
    },
    {
      id: "depth",
      label: "Bright / Deep",
      leftLabel: "Bright",
      rightLabel: "Deep",
      value: depthScore,
    },
    {
      id: "clarity",
      label: "Soft / Vivid",
      leftLabel: "Soft",
      rightLabel: "Vivid",
      value: clarityScore,
    },
  ];

  const items: ReportItem[] = [
    {
      id: "tone-balance",
      title: "톤 밸런스",
      description:
        toneSide === "웜"
          ? "웜 계열에서 혈색이 가장 안정적으로 유지돼요."
          : toneSide === "쿨"
            ? "쿨 계열에서 입술과 볼의 붉은기가 균일하게 잡혀요."
            : "웜/쿨 모두 극단으로 치우치지 않아 베이스 선택 폭이 넓습니다.",
      comparison:
        toneSide === "웜"
          ? "라벤더보단 살구·코랄 계열이 얼굴빛을 깨끗하게 보정합니다."
          : toneSide === "쿨"
            ? "라일락·장밋빛 계열이 잡티 대신 윤기를 살려줘요."
            : "웜·쿨 모두 2~3단계 차이만 조절하면 자연스럽습니다.",
      status: toneSide === "중간" ? "좋음" : "보통",
    },
    {
      id: "depth-shape",
      title: "밝기·입체감",
      description:
        depthSide === "딥"
          ? "턱선이 쉽게 뭉개지지 않아 깊이감을 살려주는 셰이딩이 잘 어울립니다."
          : depthSide === "밝음"
            ? "전체가 균일하게 밝아 하이라이터만으로도 입체감이 살아나요."
            : "중간 밝기라 과한 명암 대비보다 은은한 그라데이션이 좋아요.",
      comparison:
        depthSide === "딥"
          ? "톤다운 컬러 립·블러셔가 피부 질감을 또렷하게 보완합니다."
          : depthSide === "밝음"
            ? "과한 셰이딩보다 광채 표현으로 윤곽을 정리해 주세요."
            : "입체감을 넣을 땐 1톤 정도만 차이나게 조절하는 게 안정적이에요.",
      status: depthSide === "중간" ? "보통" : "좋음",
    },
    {
      id: "clarity",
      title: "선명도",
      description:
        claritySide === "선명"
          ? "입술·볼 표현을 또렷하게 할수록 얼굴이 밝아 보입니다."
          : claritySide === "소프트"
            ? "블러 처리된 표현이 피부를 가장 촉촉하게 보이게 합니다."
            : "선명도에 크게 민감하지 않아 상황별 룩 연출이 자유롭습니다.",
      comparison:
        claritySide === "선명"
          ? "광택 립과 투명한 블러셔로 빛을 모아주면 생기가 살아요."
          : claritySide === "소프트"
            ? "뽀얗게 번지는 크림 타입을 쓰면 붉은기가 정돈됩니다."
            : "선명/소프트를 하루 기분에 맞춰 자유롭게 바꿔보세요.",
      status: claritySide === "중간" ? "보통" : "좋음",
    },
  ];

  const tips = [
    `${toneLabel} 계열에 맞춘 베이스를 사용하면 세안 직후 느껴지는 노랗거나 붉은 톤이 한 번에 정돈돼요.`,
    "입술과 볼 컬러를 동일한 색상대 안에서만 바꿔주면 룩이 훨씬 안정적으로 완성됩니다.",
    "마지막 단계에서 선택한 밝기와 선명도를 일관되게 유지하면 촬영 후 사진에서도 차분하게 표현됩니다.",
  ];

  const needs: NeedEntry[] = [
    {
      id: "tone_anchor",
      label: "톤 유지 루틴",
      level: "high",
      description: "기초 케어 단계에서부터 라벤더 톤을 살려 피부색을 정돈해 주세요.",
    },
    {
      id: "cheek_control",
      label: "볼 온도 조절",
      level: "medium",
      description: "크림 블러셔로 광택을 준 뒤 파우더로 중앙만 살짝 눌러주면 균형이 잡혀요.",
    },
  ];

  const recommendations: ProductRecommendation[] = [
    {
      id: "base-glow",
      name: "라이트 글로우 톤업 베이스",
      brand: "Tangly Pick",
      category: "base",
      reason: "붉은기·노르스름함을 동시에 눌러주는 베이스로 톤의 기준점을 만들어줘요.",
      focus: ["톤 보정", "광채"],
      keyIngredients: ["라벤더 피그먼트", "히알루론산"],
      note: "얇게 2번 레이어링하면 들뜸 없이 화사해집니다.",
    },
    {
      id: "cheek-lip",
      name: "듀얼 크림 블러셔",
      brand: "Tangly Pick",
      category: "color",
      reason: "입술·볼에 같은 컬러를 얹어 색조 톤을 단일화할 수 있어요.",
      focus: ["색조 통일", "촉촉한 표현"],
      keyIngredients: ["세라마이드", "식물성 오일"],
    },
    {
      id: "finish-mist",
      name: "톤 세팅 미스트",
      brand: "Tangly Pick",
      category: "finisher",
      reason: "마지막 단계에서 한 번 더 톤을 잠궈 들뜸 없이 유지해 줍니다.",
      focus: ["보습막", "톤 고정"],
      keyIngredients: ["판테놀", "비타민 복합체"],
    },
  ];

  return {
    sessionLabel,
    summary,
    highlight,
    items,
    tips,
    needs,
    recommendations,
    extras: {
      toneLabel,
      palette: paletteByTone[toneLabel] ?? paletteByTone["뉴트럴 클래식"],
      storyline: storylineCopy(toneLabel, toneSide, depthSide, claritySide),
      sliderDetails,
    },
  };
};
