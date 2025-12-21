export type OxAnswer = "O" | "X" | null;

export type OxQuestionCategory =
  | "trouble"
  | "barrier"
  | "sun"
  | "habit"
  | "makeup"
  | "oil"
  | "lifestyle";

export const OX_CATEGORY_LABELS: Record<OxQuestionCategory, string> = {
  trouble: "트러블",
  barrier: "장벽",
  sun: "자외선",
  habit: "습관",
  makeup: "메이크업",
  oil: "피지",
  lifestyle: "라이프",
};

export type OxQuestion = {
  key: string;
  title: string;
  description: string;
  category: OxQuestionCategory;
  options: {
    O: string;
    X: string;
  };
};

export type OxRecord = {
  question_key: string;
  answer: OxAnswer;
  updated_at?: string | null;
};

export const OX_QUESTIONS: OxQuestion[] = [
  {
    key: "recent_skin_trouble",
    title: "최근 2주 안에 붉거나 올라온 트러블이 있었나요?",
    description: "있었다면 즉시 알려 주세요. 케어 방향을 바로 조정할 수 있어요.",
    category: "trouble",
    options: {
      O: "네, 눈에 띄는 트러블이 있었어요.",
      X: "아니요, 특별한 트러블은 없었어요.",
    },
  },
  {
    key: "sensitive_skin",
    title: "요즘 피부가 쉽게 예민해지나요?",
    description: "붉음, 따가움, 잔여드름 등 민감 신호를 확인하는 질문이에요.",
    category: "barrier",
    options: {
      O: "네, 작은 자극에도 민감해요.",
      X: "아니요, 평소와 비슷해요.",
    },
  },
  {
    key: "daily_sunscreen",
    title: "자외선 차단제를 매일 발라요?",
    description: "톤 유지와 잡티 예방에 가장 중요한 습관입니다.",
    category: "sun",
    options: {
      O: "네, 거의 매일 바르고 있어요.",
      X: "아니요, 자주 빼먹어요.",
    },
  },
  {
    key: "frequent_makeup",
    title: "주 4회 이상 메이크업을 하나요?",
    description: "메이크업 빈도는 모공과 피지 케어 방향을 정하는 데 쓰여요.",
    category: "makeup",
    options: {
      O: "네, 자주 하는 편이에요.",
      X: "아니요, 드물어요.",
    },
  },
  {
    key: "oiliness_high",
    title: "T존 유분이 하루 중 자주 번들거리나요?",
    description: "피지 밸런스와 모공 탄력 케어에 영향을 줘요.",
    category: "oil",
    options: {
      O: "네, 금방 번들거려요.",
      X: "아니요, 크게 신경 쓰이지 않아요.",
    },
  },
  {
    key: "sleep_irregular",
    title: "수면 시간이 6시간 이하로 불규칙한가요?",
    description: "수면 부족은 탄력과 회복력 저하로 이어질 수 있어요.",
    category: "lifestyle",
    options: {
      O: "네, 불규칙하고 짧아요.",
      X: "아니요, 비교적 규칙적이에요.",
    },
  },
  {
    key: "stress_high",
    title: "최근 스트레스를 자주 느끼나요?",
    description: "스트레스 호르몬은 예민함과 트러블을 유발할 수 있어요.",
    category: "lifestyle",
    options: {
      O: "네, 자주 느껴요.",
      X: "아니요, 괜찮아요.",
    },
  },
  {
    key: "water_intake_low",
    title: "하루 물 섭취가 1리터 이하인가요?",
    description: "체내 수분 부족은 각질과 수분 밀도에 영향을 줘요.",
    category: "habit",
    options: {
      O: "네, 1리터 이하예요.",
      X: "아니요, 1리터 이상 마셔요.",
    },
  },
  {
    key: "touch_face_often",
    title: "얼굴을 자주 만지는 습관이 있나요?",
    description: "손 접촉이 많으면 트러블과 장벽 이슈가 생기기 쉬워요.",
    category: "habit",
    options: {
      O: "네, 무의식적으로 자주 만져요.",
      X: "아니요, 거의 만지지 않아요.",
    },
  },
];
