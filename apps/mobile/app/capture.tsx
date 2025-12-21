import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  LayoutChangeEvent,
  LayoutRectangle,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { SERVER_BASE_URL, UPLOAD_API_URL } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { optimizePhoto, type NormalizedCropRegion } from "@/lib/photo-utils";
import type { AiReportContent } from "@/lib/ai-report";
import type { OxAnswer } from "@/lib/ox-questions";
import { useRequireProfileDetails } from "@/hooks/use-profile-details";

type FlowStage = "intro" | "capture" | "analyzing" | "report";
type CaptureState = "idle" | "uploading" | "completed" | "error";
type SessionStatus =
  | "capturing"
  | "awaiting_ox"
  | "ox_collected"
  | "analyzing"
  | "report_ready"
  | "failed";

type QualityResult = {
  passed: boolean;
  headline: string;
  detail: string;
  tip: string;
  metrics: {
    area: number;
    ratio: number;
  };
};

type StepState = {
  status: CaptureState;
  previewUri: string | null;
  uploadUrl: string | null;
  message: string;
  quality: QualityResult | null;
};

type FocusOverlay = "base" | "cheek";

type CameraLayout = {
  width: number;
  height: number;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const CAMERA_ASPECT_RATIO = 4 / 3; // width / height

const computePreviewRect = (layout: CameraLayout, aspectRatio: number): Rect => {
  const safeAspect = aspectRatio > 0 ? aspectRatio : CAMERA_ASPECT_RATIO;
  const viewRatio = layout.width / layout.height;
  if (viewRatio > safeAspect) {
    // view is wider; height limits preview
    const previewHeight = layout.height;
    const previewWidth = previewHeight * safeAspect;
    const offsetX = (layout.width - previewWidth) / 2;
    return { x: offsetX, y: 0, width: previewWidth, height: previewHeight };
  }
  // view is taller; width limits preview
  const previewWidth = layout.width;
  const previewHeight = previewWidth / safeAspect;
  const offsetY = (layout.height - previewHeight) / 2;
  return { x: 0, y: offsetY, width: previewWidth, height: previewHeight };
};

type StepConfig = {
  id: "cheek_primary" | "cheek_detail";
  title: string;
  description: string;
  guidance: string;
  shotType: "cheek";
  focusArea: "cheek";
  overlay: FocusOverlay;
};

type AnalysisStepState = {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
};

type ReportItem = {
  id: string;
  title: string;
  description: string;
  comparison: string;
  status: "좋음" | "보통" | "주의";
};

type NeedFocus = {
  id: string;
  label: string;
  level: "high" | "medium";
  description: string;
};

const SKIN_SECTION_LABELS: Record<string, string> = {
  hydration: "수분 밀도",
  elasticity: "탄력",
  barrier: "장벽",
  tone: "톤 균형",
  pore: "모공 관리",
};

type ProductRecommendationInfo = {
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

type ReportData = {
  sessionLabel: string;
  summary: string;
  highlight: string;
  items: ReportItem[];
  tips: string[];
  needs: NeedFocus[];
  recommendations: ProductRecommendationInfo[];
  aiReport?: AiReportContent | null;
};

const STEP_CONFIGS: StepConfig[] = [
  {
    id: "cheek_primary",
    title: "STEP 1 · 볼 기준 촬영",
    description: "정면을 바라보고 볼 전체가 가이드 안에 들어오도록 촬영해 주세요.",
    guidance: "코 옆부터 턱선까지 부드럽게 채워 주세요.",
    shotType: "cheek",
    focusArea: "cheek",
    overlay: "cheek",
  },
  {
    id: "cheek_detail",
    title: "STEP 2 · 볼 디테일 촬영",
    description: "첫 촬영보다 조금 더 가까이 다가가 피부 결을 선명하게 담아주세요.",
    guidance: "볼 중심을 프레임에 가득 채우면 정밀 분석이 쉬워요.",
    shotType: "cheek",
    focusArea: "cheek",
    overlay: "cheek",
  },
];

const ANALYSIS_SEQUENCE = [
  { id: "texture", label: "피부 결 분석 중" },
  { id: "elasticity", label: "탄력 계산 중" },
  { id: "wrinkle", label: "주름 패턴 확인 중" },
  { id: "tone", label: "톤 균형 측정 중" },
];

const createInitialStepState = (): StepState => ({
  status: "idle",
  previewUri: null,
  uploadUrl: null,
  message: "촬영을 시작해주세요.",
  quality: null,
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientNetworkError = (error: unknown) => {
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof Error) {
    return /Network request failed|Failed to fetch/i.test(error.message);
  }
  return false;
};

export default function StepBasedCaptureScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { loading: detailsChecking } = useRequireProfileDetails();
  const [flowStage, setFlowStage] = useState<FlowStage>("intro");
  const [flashVisible, setFlashVisible] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepStates, setStepStates] = useState<StepState[]>(
    STEP_CONFIGS.map(() => createInitialStepState())
  );
  const [globalMessage, setGlobalMessage] = useState(
    "볼 집중 스캔을 위해 첫 번째 촬영부터 시작해 주세요."
  );
  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStepState[]>(
    ANALYSIS_SEQUENCE.map((step) => ({ ...step, status: "pending" }))
  );
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [cameraLayout, setCameraLayout] = useState<CameraLayout | null>(null);
  const [focusLayouts, setFocusLayouts] = useState<Record<FocusOverlay, LayoutRectangle | null>>({
    base: null,
    cheek: null,
  });

  const analysisTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stepStatesRef = useRef(stepStates);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    stepStatesRef.current = stepStates;
  }, [stepStates]);


  useEffect(() => {
    return () => {
      analysisTimers.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    startSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (permission?.granted && flowStage === "intro" && !sessionIdRef.current) {
      startSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted]);

  const currentStep = STEP_CONFIGS[currentStepIndex];
  const currentState = stepStates[currentStepIndex];
  const isUploading = currentState.status === "uploading";
  const isCompleted = currentState.status === "completed";

  const allCompleted = useMemo(
    () => stepStates.every((state) => state.status === "completed"),
    [stepStates]
  );


  const [authUserId, setAuthUserId] = useState<string | null>(null);

  const handleCameraLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCameraLayout((prev) => {
      if (prev && prev.width === width && prev.height === height) {
        return prev;
      }
      return { width, height };
    });
  }, []);

  const handleGuideRegionMeasured = useCallback(
    (overlay: FocusOverlay, layout: LayoutRectangle) => {
      setFocusLayouts((prev) => {
        const current = prev[overlay];
        if (
          current &&
          current.x === layout.x &&
          current.y === layout.y &&
          current.width === layout.width &&
          current.height === layout.height
        ) {
          return prev;
        }
        return { ...prev, [overlay]: layout };
      });
    },
    []
  );

  const computeNormalizedRegion = useCallback(
    (
      overlay: FocusOverlay,
      photoSize?: { width?: number | null; height?: number | null }
    ): NormalizedCropRegion | null => {
      if (!cameraLayout || cameraLayout.width <= 0 || cameraLayout.height <= 0) {
        return null;
      }
      const region = focusLayouts[overlay];
      if (!region) {
        return null;
      }
      const aspectRatio =
        photoSize?.width && photoSize.height
          ? Math.abs((photoSize.width as number) / (photoSize.height as number))
          : CAMERA_ASPECT_RATIO;
      const previewRect = computePreviewRect(cameraLayout, aspectRatio);
      if (previewRect.width <= 0 || previewRect.height <= 0) {
        return null;
      }

      const left = Math.max(region.x, previewRect.x);
      const top = Math.max(region.y, previewRect.y);
      const right = Math.min(region.x + region.width, previewRect.x + previewRect.width);
      const bottom = Math.min(region.y + region.height, previewRect.y + previewRect.height);
      if (right <= left || bottom <= top) {
        return null;
      }

      const widthRatio = (right - left) / previewRect.width;
      const heightRatio = (bottom - top) / previewRect.height;
      const xRatio = (left - previewRect.x) / previewRect.width;
      const yRatio = (top - previewRect.y) / previewRect.height;

      const normalizedX = Math.min(Math.max(xRatio, 0), 1);
      const normalizedY = Math.min(Math.max(yRatio, 0), 1);
      const maxWidth = 1 - normalizedX;
      const maxHeight = 1 - normalizedY;
      const normalizedWidth = Math.min(Math.max(widthRatio, 0), maxWidth);
      const normalizedHeight = Math.min(Math.max(heightRatio, 0), maxHeight);

      if (normalizedWidth <= 0 || normalizedHeight <= 0) {
        return null;
      }

      return {
        x: normalizedX,
        y: normalizedY,
        width: normalizedWidth,
        height: normalizedHeight,
      };
    },
    [cameraLayout, focusLayouts]
  );

  useEffect(() => {
    let active = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return;
        setAuthUserId(data.user?.id ?? null);
      })
      .catch(() => {
        if (!active) return;
        setAuthUserId(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (flowStage === "capture" && allCompleted) {
      beginAnalysisPhase();
    }
  }, [flowStage, allCompleted, beginAnalysisPhase]);

  const resolveUserId = useCallback(async () => {
    if (authUserId) {
      return authUserId;
    }
    const { data } = await supabase.auth.getUser();
    const id = data.user?.id ?? null;
    setAuthUserId(id);
    return id;
  }, [authUserId]);

  const ensurePermission = async () => {
    if (permission?.granted) return true;
    const response = await requestPermission();
    return response.granted;
  };

  const createAnalysisSession = async () => {
    if (!SERVER_BASE_URL) {
      throw new Error("서버 API 주소가 설정되지 않았습니다.");
    }

    const currentUserId = await resolveUserId();
    const res = await fetch(`${SERVER_BASE_URL}/api/analysis-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "expo_app", status: "capturing", userId: currentUserId }),
    });
    const data = await res.json();
    if (!res.ok || !data?.sessionId) {
      throw new Error(data?.error || "세션 생성에 실패했습니다.");
    }
    return data.sessionId as string;
  };

  const updateSessionStatus = useCallback(async (status: SessionStatus) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    try {
      if (!SERVER_BASE_URL) {
        throw new Error("서버 API 주소가 설정되지 않았습니다.");
      }

      await fetch(`${SERVER_BASE_URL}/api/analysis-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch (error) {
      console.warn("Failed to update session status", error);
    }
  }, []);

const refreshServerReport = useCallback(
  async (options?: { loadingMessage?: string; doneMessage?: string }) => {
      const fallbackToLocalReport = () => {
      const fallback = buildReportFromQuality(
        stepStatesRef.current,
        sessionIdRef.current
      );
      setReportData(fallback);
      setGlobalMessage("기본 리포트를 표시합니다.");
    };

    if (!sessionIdRef.current) {
      fallbackToLocalReport();
      setFlowStage("report");
      return;
    }
    if (!SERVER_BASE_URL) {
      fallbackToLocalReport();
      setFlowStage("report");
      return;
    }

    try {
      setGlobalMessage(
        options?.loadingMessage ?? "리포트를 정리하는 중입니다..."
      );
      const response = await fetch(
        `${SERVER_BASE_URL}/api/reports/${sessionIdRef.current}`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "리포트 생성에 실패했습니다.");
      }

      const aiPayload: AiReportContent | null =
        payload?.aiReport?.payload ?? payload?.aiReport ?? null;
      const summaryText =
        payload.summary ??
        (Array.isArray(aiPayload?.summary)
          ? aiPayload?.summary?.join("\n")
          : "");
      const highlightText =
        payload.highlight ??
        aiPayload?.oneLiner ??
        aiPayload?.focus?.reason ??
        "";

      setReportData({
        sessionLabel:
          payload.sessionLabel ?? payload.sessionId ?? sessionIdRef.current,
        summary: summaryText ?? "",
        highlight: highlightText ?? "",
        items: Array.isArray(payload.items) ? payload.items : [],
        tips: Array.isArray(payload.tips) ? payload.tips : [],
        needs: Array.isArray(payload.needs) ? payload.needs : [],
        recommendations: Array.isArray(payload.recommendations)
          ? payload.recommendations
          : [],
        aiReport: aiPayload,
      });
      setGlobalMessage(
        options?.doneMessage ?? "1차 리포트가 준비되었습니다."
      );
    } catch (error) {
      console.warn("Failed to fetch recommendations", error);
      fallbackToLocalReport();
    } finally {
      setFlowStage("report");
    }
  },
  []
);

  const fetchSkinAnalysis = useCallback(async () => {
    if (!sessionIdRef.current || !SERVER_BASE_URL) {
      await refreshServerReport({
        loadingMessage: "기본 리포트를 불러오는 중입니다...",
      });
      return;
    }
    try {
      setGlobalMessage("AI가 촬영 이미지를 해석하는 중입니다...");
      const response = await fetch(
        `${SERVER_BASE_URL}/api/skin-analysis/${sessionIdRef.current}`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "AI 분석에 실패했습니다.");
      }
    } catch (error) {
      console.warn("Skin analysis error", error);
      setGlobalMessage("AI 분석에 실패했습니다. 기본 리포트를 준비할게요.");
    } finally {
      await refreshServerReport({
        loadingMessage: "리포트를 정리하는 중입니다...",
        doneMessage: "AI 리포트가 준비되었습니다.",
      });
      updateSessionStatus("report_ready");
    }
  }, [refreshServerReport, updateSessionStatus]);


  const startSession = async () => {
    const granted = await ensurePermission();
    if (!granted) {
      setGlobalMessage("카메라 권한이 허용되어야 촬영을 진행할 수 있습니다.");
      return;
    }

    try {
      setGlobalMessage("분석 세션을 준비하는 중입니다...");
      const sessionId = await createAnalysisSession();
      sessionIdRef.current = sessionId;
      analysisTimers.current.forEach((timer) => clearTimeout(timer));
      analysisTimers.current = [];

      setStepStates(STEP_CONFIGS.map(() => createInitialStepState()));
      setCurrentStepIndex(0);
      setReportData(null);
      setFlashVisible(false);
      setFlowStage("capture");
      setAnalysisSteps(
        ANALYSIS_SEQUENCE.map((step, index) => ({
          ...step,
          status: index === 0 ? "active" : "pending",
        }))
      );
      setGlobalMessage("가이드에 맞춰 첫 번째 촬영부터 진행해주세요.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "세션 생성 실패";
      setGlobalMessage(message);
    }
  };

  const resetStep = (index: number) => {
    setStepStates((prev) => {
      const next = [...prev];
      next[index] = createInitialStepState();
      return next;
    });
    setGlobalMessage("가이드에 맞춰 다시 촬영해주세요.");
  };

  const triggerFlash = () => {
    setFlashVisible(true);
    setTimeout(() => setFlashVisible(false), 120);
  };

  const evaluateCaptureQuality = (
    photo: { width?: number; height?: number },
    step: StepConfig
  ): QualityResult => {
    const width = photo.width ?? 0;
    const height = photo.height ?? 0;
    const area = width * height;
    const ratio = width > 0 ? height / width : 0;
    const onAndroid = Platform.OS === "android";

    if (step.id === "cheek_primary") {
      const minArea = onAndroid ? 4.5e5 : 7.5e5;
      const minRatio = onAndroid ? 0.65 : 0.75;
      const maxRatio = onAndroid ? 1.4 : 1.3;
      let passed = area >= minArea && ratio > minRatio && ratio < maxRatio;

      if (!passed && onAndroid && width >= 720 && height >= 960) {
        passed = true;
      }
      return {
        passed,
        headline: passed ? "첫 번째 볼 촬영이 통과했어요." : "볼이 충분히 채워지지 않았어요.",
        detail: passed
          ? "볼 라인과 턱선이 고르게 담겼습니다."
          : "정면을 유지한 상태에서 가이드 원을 넉넉히 채워주세요.",
        tip: "코 옆선을 가이드 중심에 맞추고 고개를 살짝만 돌리면 촬영이 안정적이에요.",
        metrics: { area, ratio },
      };
    }

    const cheekMinArea = onAndroid ? 6e5 : 1e6;
    const cheekMinRatio = onAndroid ? 0.9 : 1.0;
    let passed = area >= cheekMinArea && ratio > cheekMinRatio;
    if (!passed && onAndroid && width >= 640 && height >= 900) {
      passed = true;
    }
    return {
      passed,
      headline: passed ? "디테일 촬영이 잘 잡혔어요." : "볼에 조금만 더 가까이 다가가주세요.",
      detail: passed
        ? "피부 결이 선명하게 보이는 거리입니다."
        : "볼을 화면의 70% 이상 채우도록 카메라에 더 다가와 주세요.",
      tip: "턱선을 화면 아래쪽에 맞추고 볼 중심을 크게 채우면 정밀 분석에 도움이 됩니다.",
      metrics: { area, ratio },
    };
  };

  const uploadViaApi = async (uri: string, step: StepConfig) => {
    if (!UPLOAD_API_URL) {
      throw new Error("EXPO_PUBLIC_UPLOAD_API_URL 값을 설정해주세요.");
    }
    if (!sessionIdRef.current) {
      throw new Error("세션 정보가 없습니다. 다시 세션을 시작해주세요.");
    }

    const formData = new FormData();
    const filePayload = {
      uri,
      name: `${step.id}-${Date.now()}.jpg`,
      type: "image/jpeg",
    };
    formData.append("file", filePayload as unknown as Blob);
    formData.append("shot_type", step.shotType);
    if (step.focusArea) {
      formData.append("focus_area", step.focusArea);
    }
    formData.append("session_id", sessionIdRef.current);
    const currentUserId = await resolveUserId();
    if (currentUserId) {
      formData.append("user_id", currentUserId);
    }

    const response = await fetch(UPLOAD_API_URL, {
      method: "POST",
      body: formData,
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error || "업로드 실패");
    }
    return result;
  };


  const updateStepState = (index: number, patch: Partial<StepState>) => {
    setStepStates((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isUploading) {
      return;
    }
    if (!cameraLayout || !focusLayouts[currentStep.overlay]) {
      setGlobalMessage("가이드 위치를 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    try {
      triggerFlash();
      updateStepState(currentStepIndex, {
        status: "uploading",
        message: "촬영 데이터를 확인하는 중입니다...",
      });

      const captured = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });
      const quality = evaluateCaptureQuality(captured, currentStep);
      updateStepState(currentStepIndex, {
        previewUri: captured.uri,
        quality,
        message: quality.headline,
        status: quality.passed ? "uploading" : "error",
      });

      if (!quality.passed) {
        setGlobalMessage(`${quality.detail} 다시 촬영을 권장합니다.`);
        setFlashVisible(false);
        return;
      }

      const focusRegion = computeNormalizedRegion(currentStep.overlay, captured);
      if (__DEV__) {
        console.log("[capture] focus layout", {
          overlay: currentStep.overlay,
          layout: focusLayouts[currentStep.overlay],
          cameraLayout,
          photoSize: { width: captured.width, height: captured.height },
          region: focusRegion,
        });
      }
      if (!focusRegion) {
        setGlobalMessage("가이드 영역을 찾지 못했습니다. 다시 촬영해주세요.");
        updateStepState(currentStepIndex, {
          status: "error",
          message: "가이드 영역을 찾지 못했습니다.",
        });
        setFlashVisible(false);
        return;
      }

      const processedPhoto = await optimizePhoto(captured, { crop: focusRegion });
      updateStepState(currentStepIndex, {
        previewUri: processedPhoto.uri,
      });
      updateStepState(currentStepIndex, {
        message: "촬영이 통과되었습니다. 업로드 중...",
      });

      let result;
      try {
        result = await uploadViaApi(processedPhoto.uri, currentStep);
      } catch (error) {
        if (!isTransientNetworkError(error)) {
          throw error;
        }

        updateStepState(currentStepIndex, {
          message: "네트워크가 잠시 불안정해 한번 더 전송하고 있어요...",
        });
        setGlobalMessage("전송이 끊겨 잠깐 대기 후 다시 시도하는 중입니다.");
        await wait(800);

        result = await uploadViaApi(processedPhoto.uri, currentStep);
      }

      const publicUrl =
        result?.publicUrl ?? result?.photo?.image_url ?? result?.photo?.image_url;

      updateStepState(currentStepIndex, {
        status: "completed",
        uploadUrl: publicUrl || null,
        message: "저장 완료! 다음 단계로 이동하세요.",
      });

      setGlobalMessage(
        currentStepIndex === STEP_CONFIGS.length - 1
          ? "모든 촬영이 끝났어요. 곧 분석을 시작합니다."
          : "촬영이 저장되었습니다. 다음 단계로 넘어가세요."
      );
    } catch (error) {
      updateStepState(currentStepIndex, {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "촬영 또는 업로드 중 문제가 발생했습니다.",
      });
      setGlobalMessage("문제가 발생했습니다. 다시 시도해주세요.");
      setFlashVisible(false);
    }
  };

  const moveNextStep = () => {
    if (currentStepIndex < STEP_CONFIGS.length - 1 && isCompleted) {
      setCurrentStepIndex((prev) => prev + 1);
      setGlobalMessage("가이드에 맞춰 다음 촬영을 진행해주세요.");
    }
  };

  const beginAnalysisPhase = useCallback(() => {
    setFlowStage("analyzing");
    setGlobalMessage("Tangly AI가 촬영 이미지를 분석 중입니다.");
    updateSessionStatus("analyzing");
    setAnalysisSteps(
      ANALYSIS_SEQUENCE.map((step, index) => ({
        ...step,
        status: index === 0 ? "active" : "pending",
      }))
    );

    analysisTimers.current.forEach((timer) => clearTimeout(timer));
    analysisTimers.current = [];

    ANALYSIS_SEQUENCE.forEach((_, idx) => {
      const timer = setTimeout(() => {
        setAnalysisSteps((prev) =>
          prev.map((item, i) => {
            if (i < idx) return { ...item, status: "done" };
            if (i === idx) return { ...item, status: "done" };
            if (i === idx + 1) return { ...item, status: "active" };
            return item;
          })
        );

        if (idx === ANALYSIS_SEQUENCE.length - 1) {
          const finishTimer = setTimeout(() => {
            fetchSkinAnalysis();
          }, 1000);
          analysisTimers.current.push(
            finishTimer as ReturnType<typeof setTimeout>
          );
        }
      }, 1600 * (idx + 1));
      analysisTimers.current.push(timer as ReturnType<typeof setTimeout>);
    });
  }, [fetchSkinAnalysis, updateSessionStatus]);

  const isCaptureStage = flowStage === "capture" || flowStage === "intro";

  if (detailsChecking) {
    return (
      <SafeAreaView style={styles.captureSafeArea}>
        <View style={styles.loadingState}>
          <ActivityIndicator color="#A884CC" />
          <Text style={styles.loadingText}>맞춤 정보를 불러오는 중입니다...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isCaptureStage) {
    return (
      <SafeAreaView style={styles.captureSafeArea}>
        <ScrollView contentContainerStyle={styles.captureContainer} bounces={false}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>볼 집중 스캔</Text>
            <Text style={styles.headerSubtitle}>두 번의 볼 촬영으로 정밀도를 높여요.</Text>
          </View>

          <View style={styles.stepCard}>
            <Text style={styles.stepProgress}>
              {currentStepIndex + 1}/{STEP_CONFIGS.length}
            </Text>
            <Text style={styles.stepTitle}>{currentStep.title}</Text>
            <Text style={styles.stepDescription}>{currentStep.description}</Text>
          </View>

          <View style={styles.cameraWrapper}>
            <View style={styles.cameraSurface} onLayout={handleCameraLayout}>
              {permission ? (
                permission.granted ? (
                  <>
                    <CameraView
                      ref={cameraRef}
                      style={StyleSheet.absoluteFill}
                      facing="front"
                      ratio="4:3"
                    />
                    <CheekGuideOverlay
                      onRegionMeasured={(layout) => handleGuideRegionMeasured("cheek", layout)}
                    />
                    {flashVisible && <View style={styles.flashOverlay} pointerEvents="none" />}
                  </>
                ) : (
                  <View style={styles.permissionBlock}>
                    <Text style={styles.permissionText}>카메라 접근 권한이 필요합니다.</Text>
                    <Pressable style={styles.permissionButton} onPress={requestPermission}>
                      <Text style={styles.permissionButtonText}>권한 허용하기</Text>
                    </Pressable>
                  </View>
                )
              ) : (
                <View style={styles.permissionBlock}>
                  <ActivityIndicator color="#A884CC" />
                </View>
              )}
            </View>
            <Text style={styles.guidanceText}>{currentStep.guidance}</Text>
          </View>

          <View style={styles.statusBlock}>
            <Text
              style={[
                styles.statusLabel,
                currentState.status === "error" && styles.statusLabelError,
              ]}
            >
              {currentState.message}
            </Text>
            {currentState.quality?.tip ? (
              <Text style={styles.statusTip}>{currentState.quality.tip}</Text>
            ) : null}
            <Text style={styles.globalMessage}>{globalMessage}</Text>
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.secondaryButton, isUploading && styles.buttonDisabled]}
              onPress={() => resetStep(currentStepIndex)}
              disabled={isUploading}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  isUploading && styles.secondaryButtonTextDisabled,
                ]}
              >
                다시 촬영
              </Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, isUploading && styles.buttonDisabled]}
              onPress={handleCapture}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>사진 찍기</Text>
              )}
            </Pressable>
          </View>

          {currentStepIndex < STEP_CONFIGS.length - 1 && (
            <Pressable
              disabled={!isCompleted}
              onPress={moveNextStep}
              style={[styles.nextButton, !isCompleted && styles.buttonDisabled]}
            >
              <Text
                style={[
                  styles.nextButtonText,
                  !isCompleted && styles.nextButtonTextDisabled,
                ]}
              >
                다음 촬영 진행
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flowSafeArea}>
      <ScrollView contentContainerStyle={styles.flowContainer}>
        {flowStage === "analyzing" && (
          <AnalysisProgressView steps={analysisSteps} />
        )}

        {flowStage === "report" && reportData && (
          <ReportView data={reportData} onRestart={startSession} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const AnalysisProgressView = ({
  steps,
}: {
  steps: AnalysisStepState[];
}) => (
  <View style={styles.analysisCard}>
    <Text style={styles.analysisTitle}>AI 분석 중</Text>
    <Text style={styles.analysisSubtitle}>
      촬영한 이미지를 기반으로 피부 결 · 탄력 · 주름 패턴을 순차적으로 확인하고 있어요.
    </Text>
    {steps.map((step) => (
      <View key={step.id} style={styles.analysisRow}>
        <View
          style={[
            styles.analysisDot,
            step.status === "done" && styles.analysisDotDone,
            step.status === "active" && styles.analysisDotActive,
          ]}
        />
        <Text
          style={[
            styles.analysisLabel,
            step.status !== "pending" && styles.analysisLabelActive,
          ]}
        >
          {step.label}
        </Text>
        <Text style={styles.analysisStatusText}>
          {step.status === "pending"
            ? "대기"
            : step.status === "active"
              ? "진행 중"
              : "완료"}
        </Text>
      </View>
    ))}
  </View>
);

const ReportView = ({
  data,
  onRestart,
}: {
  data: ReportData;
  onRestart: () => void;
}) => {
  const aiReport = data.aiReport ?? null;
  const summaryLines =
    aiReport?.summary?.filter((line) => !!line?.trim()) ?? [];
  const keyFindings = aiReport?.keyFindings ?? [];
  const actions = aiReport?.actions ?? [];
  const warnings = aiReport?.warnings ?? [];

  const translateStatus = (status?: string | null) => {
    switch ((status ?? "").toLowerCase()) {
      case "good":
        return { label: "좋음", style: styles.reportBadgeSuccess };
      case "caution":
        return { label: "주의", style: styles.reportBadgeWarning };
      default:
        return { label: "보통", style: null };
    }
  };

  const formatFrequency = (frequency?: string | null) => {
    switch ((frequency ?? "").toLowerCase()) {
      case "daily":
        return "매일 권장";
      case "weekly":
        return "주 1회 권장";
      case "three_per_week":
        return "주 3회 권장";
      default:
        return "권장 주기 자유";
    }
  };

  const displayFindingTitle = (title?: string | null) => {
    if (!title) return "";
    const normalized = title.toLowerCase().trim();
    return SKIN_SECTION_LABELS[normalized] ?? title;
  };

  return (
    <View style={styles.reportCard}>
      <Text style={styles.reportTitle}>AI 피부 리포트</Text>
      <Text style={styles.reportSession}>세션: {data.sessionLabel}</Text>
      {aiReport?.oneLiner ? (
        <Text style={styles.reportHighlight}>{aiReport.oneLiner}</Text>
      ) : (
        <Text style={styles.reportHighlight}>{data.highlight}</Text>
      )}
      <Text style={styles.reportSummary}>
        {summaryLines.length ? summaryLines.join("\n") : data.summary}
      </Text>

      {aiReport?.focus?.reason && (
        <View style={styles.aiFocusCard}>
          <Text style={styles.aiFocusLabel}>집중 케어</Text>
          <Text style={styles.aiFocusText}>{aiReport.focus.reason}</Text>
        </View>
      )}

      {keyFindings.length > 0 && (
        <View style={styles.aiFindingSection}>
          <Text style={styles.aiSectionTitle}>핵심 관찰</Text>
          {keyFindings.map((finding, index) => {
            const { label, style } = translateStatus(finding.status);
            return (
              <View key={`${finding.title}-${index}`} style={styles.aiFindingCard}>
                <View style={styles.aiFindingHeader}>
                    <Text style={styles.aiFindingTitle}>{displayFindingTitle(finding.title)}</Text>
                  <Text style={[styles.reportBadge, style]}>{label}</Text>
                </View>
                <Text style={styles.aiFindingDescription}>{finding.description}</Text>
              </View>
            );
          })}
        </View>
      )}

      {actions.length > 0 && (
        <View style={styles.aiActionSection}>
          <Text style={styles.aiSectionTitle}>관리법 제안</Text>
          {actions.map((action, index) => (
            <View key={`${action.title}-${index}`} style={styles.aiActionCard}>
              <Text style={styles.aiActionTitle}>{action.title}</Text>
              <Text style={styles.aiActionDescription}>{action.description}</Text>
              <Text style={styles.aiActionMeta}>{formatFrequency(action.frequency)}</Text>
            </View>
          ))}
        </View>
      )}

      {warnings.length > 0 && (
        <View style={styles.aiWarningCard}>
          <Text style={styles.aiSectionTitle}>주의 안내</Text>
          {warnings.map((warning) => (
            <Text key={warning} style={styles.aiWarningText}>
              • {warning}
            </Text>
          ))}
        </View>
      )}

      {data.needs.length > 0 && <NeedFocusList needs={data.needs} />}

      {data.recommendations.length > 0 && (
        <View style={styles.recommendSection}>
          <Text style={styles.recommendSectionTitle}>세션 맞춤 제품 추천</Text>
          <Text style={styles.recommendIntro}>
            그래서 이번 추천은, 지금 피부 상태를 기준으로 골랐어요.
          </Text>
          <Text style={styles.recommendIntroSecondary}>
            지금 단계에서 가장 부담 없이 도움이 될 제품들이에요.
          </Text>
          {data.recommendations.map((item) => (
            <ProductRecommendationCard key={item.id} item={item} />
          ))}
        </View>
      )}

      {!aiReport && (
        <>
          <View style={styles.reportItemList}>
            {data.items.map((item) => (
              <View key={item.id} style={styles.reportItem}>
                <View style={styles.reportItemHeader}>
                  <Text style={styles.reportItemTitle}>{item.title}</Text>
                  <Text
                    style={[
                      styles.reportBadge,
                      item.status === "주의" && styles.reportBadgeWarning,
                    ]}
                  >
                    {item.status}
                  </Text>
                </View>
                <Text style={styles.reportItemDescription}>{item.description}</Text>
                <Text style={styles.reportItemComparison}>{item.comparison}</Text>
              </View>
            ))}
          </View>

          <View style={styles.reportTips}>
            <Text style={styles.reportTipsTitle}>케어 팁</Text>
            {data.tips.map((tip) => (
              <Text key={tip} style={styles.reportTip}>
                • {tip}
              </Text>
            ))}
          </View>
        </>
      )}

      <Pressable style={styles.reportRestart} onPress={onRestart}>
        <Text style={styles.reportRestartText}>새로운 촬영 시작</Text>
      </Pressable>
    </View>
  );
};

const NeedFocusList = ({ needs }: { needs: NeedFocus[] }) => (
  <View style={styles.needsCard}>
    <Text style={styles.needsTitle}>이번 세션에서 우선 보완할 케어</Text>
    {needs.map((need) => (
      <View key={need.id} style={styles.needRow}>
        <View style={styles.needBadge}>
          <Text style={styles.needBadgeLabel}>{need.label}</Text>
          <Text style={styles.needBadgeLevel}>
            {need.level === "high" ? "우선" : "보강"}
          </Text>
        </View>
        <Text style={styles.needDescription}>{need.description}</Text>
      </View>
    ))}
  </View>
);

const ProductRecommendationCard = ({
  item,
}: {
  item: ProductRecommendationInfo;
}) => (
  <View style={styles.recommendCard}>
    <View style={styles.recommendHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.recommendName}>{item.name}</Text>
        {item.brand && <Text style={styles.recommendBrand}>{item.brand}</Text>}
        {item.category && (
          <Text style={styles.recommendCategory}>{item.category}</Text>
        )}
      </View>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.recommendImage} />
      ) : null}
    </View>
    <Text style={styles.recommendReason}>{item.reason}</Text>
    {item.focus.length > 0 && (
      <View style={styles.recommendFocusRow}>
        {item.focus.map((focus) => (
          <Text key={focus} style={styles.recommendFocusChip}>
            {focus}
          </Text>
        ))}
      </View>
    )}
    {item.keyIngredients.length > 0 && (
      <Text style={styles.recommendIngredients}>
        핵심 성분: {item.keyIngredients.join(", ")}
      </Text>
    )}
    {item.note ? <Text style={styles.recommendNote}>{item.note}</Text> : null}
  </View>
);

type GuideOverlayProps = {
  onRegionMeasured: (layout: LayoutRectangle) => void;
};

const CheekGuideOverlay = ({ onRegionMeasured }: GuideOverlayProps) => (
  <View pointerEvents="none" style={styles.overlayContainer}>
    <View
      style={styles.cheekGuideCircle}
      onLayout={(event) => onRegionMeasured(event.nativeEvent.layout)}
    />
  </View>
);

const buildReportFromQuality = (
  states: StepState[],
  sessionId: string | null,
  oxAnswers?: Record<string, OxAnswer | null>
): ReportData => {
  const firstCheekQuality = states[0]?.quality;
  const detailCheekQuality = states[1]?.quality;

  const feelsTight = oxAnswers?.["tight_after_wash"] === "O";
  const makeupCakey = oxAnswers?.["makeup_cakey"] === "O";
  const elasticityConcern = oxAnswers?.["elasticity_change"] === "O";
  const feelsSensitive = oxAnswers?.["skin_sensitive_now"] === "O";
  const troubleFree = oxAnswers?.["no_recent_trouble"] === "O";

  const empathyIntro = firstCheekQuality?.passed
    ? "첫 번째 볼 촬영에서 전체 라인이 고르게 잡혔어요."
    : "첫 촬영 정보가 살짝 부족했지만, 지금 피부는 충분히 회복 가능한 상태예요.";

  const photoNarrative = detailCheekQuality?.passed
    ? "디테일 촬영에서도 결이 비교적 균일하게 유지되고 있어요."
    : "디테일 촬영에서 결이 다소 흐려 보여 추가 관리가 필요해요.";

  const oxNarratives: string[] = [];
  if (feelsTight) {
    oxNarratives.push(
      "세안 후 당김을 느끼신다고 한 점을 보면, 지금 피부가 수분을 유지하는 힘이 조금 약해진 상태예요."
    );
    oxNarratives.push("그래서 단순히 수분을 넣는 것보다, 지금 있는 수분을 지켜주는 관리가 더 중요해요.");
  } else if (makeupCakey) {
    oxNarratives.push(
      "화장이 자주 들뜬다고 느끼는 건, 피부 속 컨디션이 균일하지 않을 때 자주 나타나는 신호예요."
    );
    oxNarratives.push("이럴 땐 각질을 자극적으로 제거하기보다는 피부 결을 편안하게 정돈해주는 방향이 좋아요.");
  } else if (elasticityConcern) {
    oxNarratives.push("탄력이 예전 같지 않다고 느끼신 부분이 이번 촬영 결과와도 맞아 떨어졌어요.");
    oxNarratives.push("완전히 무너진 상태는 아니고, 지금 관리하면 회복 가능한 시기예요.");
  } else if (feelsSensitive) {
    oxNarratives.push("요즘 피부가 예민해졌다고 느끼신 점을 보면, 피부 장벽이 조금 약해진 상태일 수 있어요.");
    oxNarratives.push("이럴 땐 강한 기능성보다 기본을 지켜주는 관리가 더 효과적이에요.");
  } else if (troubleFree) {
    oxNarratives.push("특별한 트러블이 없다는 점은, 피부 기본 컨디션이 잘 유지되고 있다는 신호예요.");
    oxNarratives.push("지금은 문제 해결보다는 상태 유지 + 예방 관리가 잘 맞는 시기예요.");
  }

  const careDirection = (() => {
    if (!detailCheekQuality?.passed || elasticityConcern || feelsTight) {
      return "그래서 이번엔 수분을 많이 넣기보다는 탄력을 받쳐주면서 수분을 지켜주는 관리가 잘 맞아요.";
    }
    if (makeupCakey) {
      return "지금은 강한 기능성보다는 피부 결을 편안하게 정돈해주는 관리가 좋아요.";
    }
    if (feelsSensitive) {
      return "예민해진 느낌이 있을 땐 장벽을 차분히 다독여주는 루틴이 우선이에요.";
    }
    if (troubleFree) {
      return "지금은 상태를 유지하면서 예방 위주의 케어를 이어가면 충분해요.";
    }
    return "자극적이지 않은 기본 루틴을 일정하게 이어가는 것이 가장 도움이 돼요.";
  })();

  const summaryParts = [empathyIntro, photoNarrative];
  if (oxNarratives.length) {
    summaryParts.push(oxNarratives.join(" "));
  }
  summaryParts.push(careDirection);

  const summary = summaryParts.filter(Boolean).join("\n\n");
  const highlight = careDirection;

  const items: ReportItem[] = [
    {
      id: "overall",
      title: "전체 컨디션",
      description: firstCheekQuality?.passed
        ? "첫 번째 촬영 기준으로 피부 결은 크게 무너지지 않았어요."
        : "첫 촬영 정보가 제한적이라 조심스럽게 안내드릴게요.",
      comparison: troubleFree
        ? "특별한 트러블이 없다는 응답과도 흐름이 비슷해요."
        : "부분적으로 컨디션이 흔들리면 트러블로 번지기 쉬운 시기예요.",
      status: troubleFree ? "좋음" : "보통",
    },
    {
      id: "elasticity",
      title: "탄력",
      description: detailCheekQuality?.passed
        ? "볼 라인 탄력이 아직은 잘 유지되고 있어요."
        : "볼 라인이 아래로 살짝 끌리는 신호가 보여요.",
      comparison: elasticityConcern
        ? "탄력이 예전 같지 않다는 답변과도 맞물려 보여요."
        : "지금은 급하게 당길 필요는 없어요.",
      status: detailCheekQuality?.passed && !elasticityConcern ? "보통" : "주의",
    },
    {
      id: "hydration",
      title: "수분 · 윤기",
      description: feelsTight
        ? "수분을 오래 붙잡아두기엔 살짝 버거워 보이는 상태예요."
        : makeupCakey
          ? "피부 속 컨디션이 균일하지 않아 화장이 들뜰 수 있어요."
          : "수분을 받아들이는 힘은 크게 나쁘지 않아요.",
      comparison: feelsTight
        ? "세안 직후 건조 신호가 올 수 있으니 바로 보습막을 덮어주세요."
        : "가벼운 윤기 관리만 더해도 충분해요.",
      status: feelsTight || makeupCakey ? "주의" : "좋음",
    },
  ];

  const tips = [
    feelsTight
      ? "세안 후 1분 안에 가벼운 수분막을 덮어 수분이 달아나지 않게 해보세요."
      : "클렌징 후에도 얼굴이 크게 당기지 않는다면 지금 루틴을 유지해도 좋아요.",
    makeupCakey
      ? "각질을 자극적으로 제거하기보다 결 정돈 토너로 부드럽게 다독여주세요."
      : feelsSensitive
        ? "예민하다고 느낄 땐 강한 기능성보다 기본 보습과 진정 루틴부터 챙겨주세요."
        : "주 1~2회 수분 팩을 올려 윤기를 보충하면 탄력도 같이 유지되기 쉬워요.",
  ];

  return {
    sessionLabel: sessionId ?? "임시 세션",
    summary,
    highlight,
    items,
    tips,
    needs: [
      {
        id: "routine_focus",
        label: feelsTight || makeupCakey ? "수분 유지 루틴" : "안정 관리",
        level: !detailCheekQuality?.passed || feelsTight ? "high" : "medium",
        description:
          "이번 리포트는 촬영 결과와 OX 응답을 엮어 현재에 맞는 관리 방향을 제안합니다.",
      },
    ],
      recommendations: [],
    aiReport: null,
  };
};

const styles = StyleSheet.create({
  captureSafeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  captureContainer: {
    padding: 20,
    gap: 20,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: "#6F6F73",
  },
  header: {
    gap: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F1F24",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#6F6F73",
  },
  stepCard: {
    borderRadius: 20,
    backgroundColor: "#F7F4FB",
    padding: 16,
    gap: 6,
  },
  stepProgress: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8D7EB3",
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F1F24",
  },
  stepDescription: {
    fontSize: 14,
    color: "#6F6F73",
  },
  cameraWrapper: {
    gap: 10,
  },
  cameraSurface: {
    width: "100%",
    height: 420,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  permissionBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  permissionText: {
    fontSize: 15,
    color: "#F2F2F7",
    textAlign: "center",
  },
  permissionButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#A884CC",
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  guidanceText: {
    fontSize: 13,
    color: "#6F6F73",
    textAlign: "center",
  },
  statusBlock: {
    gap: 6,
    paddingVertical: 4,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F1F24",
  },
  statusLabelError: {
    color: "#C0392B",
  },
  statusTip: {
    fontSize: 13,
    color: "#7A738C",
  },
  globalMessage: {
    fontSize: 12,
    color: "#9A94A8",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "#A884CC",
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D9CCE9",
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#5A4E73",
    fontWeight: "600",
  },
  secondaryButtonTextDisabled: {
    color: "#A5A1B4",
  },
  nextButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E0D8F1",
    paddingVertical: 14,
    alignItems: "center",
  },
  nextButtonText: {
    color: "#5A4E73",
    fontWeight: "600",
  },
  nextButtonTextDisabled: {
    color: "#B2ACC4",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  overlayContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  cheekGuideCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.85)",
  },
  flashOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    opacity: 0.9,
  },
  flowSafeArea: {
    flex: 1,
    backgroundColor: "#F6F1FA",
  },
  flowContainer: {
    padding: 20,
    gap: 20,
  },
  analysisCard: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  analysisTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f1b2e",
  },
  analysisSubtitle: {
    color: "#4B3A63",
    fontSize: 13,
  },
  analysisRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  analysisDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#D9CCE9",
  },
  analysisDotActive: {
    backgroundColor: "#A884CC",
  },
  analysisDotDone: {
    backgroundColor: "#2ECC71",
  },
  analysisLabel: {
    flex: 1,
    color: "#78738C",
    fontSize: 14,
  },
  analysisLabelActive: {
    color: "#1f1b2e",
    fontWeight: "600",
  },
  analysisStatusText: {
    width: 60,
    textAlign: "right",
    color: "#78738C",
  },
  reportCard: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  reportTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f1b2e",
  },
  reportSession: {
    color: "#6A4BA1",
    fontSize: 12,
  },
  reportSummary: {
    fontSize: 15,
    color: "#1f1b2e",
  },
  reportHighlight: {
    fontSize: 14,
    color: "#C0392B",
    fontWeight: "600",
  },
  reportItemList: {
    gap: 12,
  },
  reportItem: {
    backgroundColor: "#F6F1FA",
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  reportItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reportItemTitle: {
    fontWeight: "700",
    color: "#1f1b2e",
  },
  reportBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#D6BDF0",
    color: "#1f1b2e",
    fontSize: 12,
    fontWeight: "700",
  },
  reportBadgeSuccess: {
    backgroundColor: "#D5F5E3",
    color: "#117A65",
  },
  reportBadgeWarning: {
    backgroundColor: "#FADBD8",
    color: "#C0392B",
  },
  reportItemDescription: {
    color: "#4B3A63",
  },
  reportItemComparison: {
    fontSize: 12,
    color: "#6A4BA1",
  },
  reportTips: {
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  reportTipsTitle: {
    fontWeight: "700",
    color: "#1f1b2e",
  },
  reportTip: {
    color: "#4B3A63",
    fontSize: 13,
  },
  aiFocusCard: {
    borderRadius: 14,
    backgroundColor: "#F0ECFB",
    padding: 12,
    marginTop: 8,
  },
  aiFocusLabel: {
    color: "#7E5EC9",
    fontSize: 12,
    fontWeight: "600",
  },
  aiFocusText: {
    color: "#4B3A63",
    fontSize: 13,
    marginTop: 4,
  },
  aiFindingSection: {
    gap: 10,
    marginTop: 12,
  },
  aiActionSection: {
    gap: 10,
    marginTop: 12,
  },
  aiSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1f1b2e",
  },
  aiFindingCard: {
    backgroundColor: "#F6F1FA",
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  aiFindingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  aiFindingTitle: {
    fontWeight: "600",
    color: "#1f1b2e",
  },
  aiFindingDescription: {
    color: "#4B3A63",
    fontSize: 13,
    lineHeight: 18,
  },
  aiActionCard: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  aiActionTitle: {
    fontWeight: "600",
    color: "#1f1b2e",
  },
  aiActionDescription: {
    color: "#4B3A63",
    fontSize: 13,
    lineHeight: 18,
  },
  aiActionMeta: {
    color: "#6A4BA1",
    fontSize: 12,
  },
  aiWarningCard: {
    backgroundColor: "#FFF4E6",
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  aiWarningText: {
    color: "#B35400",
    fontSize: 13,
  },
  reportRestart: {
    backgroundColor: "#1f1b2e",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  reportRestartText: {
    color: "white",
    fontWeight: "700",
  },
  needsCard: {
    backgroundColor: "#F4F0FF",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  needsTitle: {
    fontWeight: "700",
    color: "#1f1b2e",
  },
  needRow: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  needBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  needBadgeLabel: {
    fontWeight: "700",
    color: "#5C3AA1",
  },
  needBadgeLevel: {
    backgroundColor: "#E4DDF7",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 12,
    color: "#5C3AA1",
    fontWeight: "700",
  },
  needDescription: {
    color: "#4B3A63",
    fontSize: 13,
  },
  recommendSection: {
    gap: 12,
  },
  recommendSectionTitle: {
    fontWeight: "700",
    color: "#1f1b2e",
    fontSize: 16,
  },
  recommendIntro: {
    color: "#4B3A63",
    fontSize: 13,
  },
  recommendIntroSecondary: {
    color: "#6A4BA1",
    fontSize: 12,
  },
  recommendCard: {
    backgroundColor: "#F6F1FA",
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  recommendHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  recommendName: {
    fontWeight: "700",
    color: "#1f1b2e",
    fontSize: 16,
  },
  recommendBrand: {
    color: "#6A4BA1",
    fontSize: 13,
  },
  recommendCategory: {
    color: "#8C7FAE",
    fontSize: 12,
  },
  recommendImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: "#E4DDF7",
  },
  recommendReason: {
    color: "#4B3A63",
    fontSize: 13,
  },
  recommendFocusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recommendFocusChip: {
    backgroundColor: "#1f1b2e",
    color: "white",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
  },
  recommendIngredients: {
    color: "#5C3AA1",
    fontSize: 12,
  },
  recommendNote: {
    color: "#7A6D92",
    fontSize: 12,
  },
});
