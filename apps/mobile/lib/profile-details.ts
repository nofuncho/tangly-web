export type ProfileGender = "female" | "male" | "unspecified" | null;

export type ProfileDetails = {
  gender: ProfileGender;
  ageRange: string | null;
  birthYear?: number | null;
  concerns: string[];
  completedAt?: string | null;
};

const DEFAULT_DETAILS: ProfileDetails = {
  gender: null,
  ageRange: null,
  birthYear: null,
  concerns: [],
  completedAt: null,
};

export const parseProfileDetails = (metadata: unknown): ProfileDetails => {
  if (!metadata || typeof metadata !== "object") {
    return { ...DEFAULT_DETAILS };
  }

  const root = metadata as Record<string, unknown>;
  const detailsRaw = (root.details ?? root.profileDetails) as Record<string, unknown> | undefined;
  const source = detailsRaw && typeof detailsRaw === "object" ? detailsRaw : root;

  const gender = normalizeGender(source.gender);
  const ageRange = normalizeString(source.ageRange ?? source.age_range);
  const birthYear = normalizeNumber(source.birthYear ?? source.birth_year);
  const concerns = normalizeStringArray(
    source.concerns ?? source.skinConcerns ?? source.skin_concerns
  );
  const completedAt = normalizeString(source.completedAt ?? source.completed_at);

  return {
    gender,
    ageRange,
    birthYear,
    concerns,
    completedAt,
  };
};

export const isProfileDetailsComplete = (details?: ProfileDetails | null) => {
  if (!details) return false;
  if (!details.gender) return false;
  if (!details.ageRange && !details.birthYear) return false;
  if (!details.concerns.length) return false;
  if (details.concerns.length === 1 && details.concerns[0] === "unknown") {
    return true;
  }
  return details.concerns.length > 0;
};

const normalizeGender = (value: unknown): ProfileGender => {
  const input = normalizeString(value);
  if (!input) return null;
  if (input === "female" || input === "여성") {
    return "female";
  }
  if (input === "male" || input === "남성") {
    return "male";
  }
  if (input === "unspecified" || input === "none" || input === "선택하지 않음") {
    return "unspecified";
  }
  return null;
};

const normalizeString = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
};

const normalizeNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => Boolean(entry));
};

const CONCERN_PRIORITY = [
  "wrinkle",
  "elasticity",
  "sagging",
  "dryness",
  "inner_dryness",
  "texture",
  "dullness",
  "radiance",
  "spots",
  "pigmentation",
  "redness",
  "sensitivity",
  "trouble",
  "sebum",
  "blackhead",
];

export const pickPrimaryConcern = (concerns?: string[] | null) => {
  if (!concerns || !concerns.length) return null;
  const ordered = [...concerns];
  ordered.sort((a, b) => {
    const left = concernPriorityIndex(a);
    const right = concernPriorityIndex(b);
    return left - right;
  });
  return ordered[0];
};

const concernPriorityIndex = (value: string) => {
  const index = CONCERN_PRIORITY.indexOf(value);
  return index >= 0 ? index : CONCERN_PRIORITY.length + 1;
};

export const concernToFriendlyLabel = (value?: string | null) => {
  if (!value) return null;
  return CONCERN_LABELS[value] ?? null;
};

const CONCERN_LABELS: Record<string, string> = {
  wrinkle: "주름",
  elasticity: "탄력 저하",
  sagging: "처짐(리프팅)",
  dryness: "건조함",
  inner_dryness: "속건조(당김)",
  pores: "모공",
  texture: "피부결",
  dullness: "칙칙함",
  radiance: "광채 부족",
  spots: "기미/잡티",
  pigmentation: "색소침착",
  redness: "홍조",
  sensitivity: "민감/자극",
  trouble: "트러블",
  sebum: "피지/번들거림",
  blackhead: "블랙헤드/화이트헤드",
  eye_wrinkle: "아이 주름",
  dark_circle: "다크서클",
  flakiness: "각질/들뜸",
  makeup_caking: "메이크업 들뜸",
  unknown: "잘 모르겠어요",
};

export type FocusKey = "hydration" | "elasticity" | "wrinkle" | "radiance" | "trouble";

export const mapConcernToFocus = (concern?: string | null): FocusKey => {
  switch (concern) {
    case "wrinkle":
    case "eye_wrinkle":
      return "wrinkle";
    case "elasticity":
    case "sagging":
      return "elasticity";
    case "dryness":
    case "inner_dryness":
    case "flakiness":
      return "hydration";
    case "dullness":
    case "radiance":
    case "pigmentation":
    case "spots":
      return "radiance";
    case "trouble":
    case "sebum":
    case "blackhead":
      return "trouble";
    default:
      return "hydration";
  }
};
