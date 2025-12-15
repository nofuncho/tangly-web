import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";

type FlowStage = "intro" | "capture" | "ox" | "analyzing" | "report";
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

type StepConfig = {
  id: "base" | "cheek";
  title: string;
  description: string;
  shotType: "base" | "cheek";
  focusArea: "cheek" | null;
  overlay: "base" | "cheek";
  highlightColor: string;
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
};

type OXAnswer = "O" | "X" | null;

type OXQuestion = {
  key: string;
  title: string;
  description: string;
};

const UPLOAD_API_URL = process.env.EXPO_PUBLIC_UPLOAD_API_URL ?? "";
const SERVER_BASE_URL = (() => {
  const envBase = process.env.EXPO_PUBLIC_SERVER_BASE_URL?.replace(/\/$/, "");
  if (envBase) {
    return envBase;
  }
  if (UPLOAD_API_URL) {
    try {
      const url = new URL(UPLOAD_API_URL);
      return `${url.protocol}//${url.host}`;
    } catch {
      return "";
    }
  }
  return "";
})();

const STEP_CONFIGS: StepConfig[] = [
  {
    id: "base",
    title: "STEP 1 · 기준 얼굴",
    description: "얼굴 전체가 가이드 안에 들어오도록 정면을 맞춰주세요.",
    shotType: "base",
    focusArea: null,
    overlay: "base",
    highlightColor: "#A884CC",
  },
  {
    id: "cheek",
    title: "STEP 2 · 볼 클로즈업",
    description: "볼을 가까이 촬영해 피부 결이 선명하게 보이도록 맞춰주세요.",
    shotType: "cheek",
    focusArea: "cheek",
    overlay: "cheek",
    highlightColor: "#F08DC2",
  },
];

const ANALYSIS_SEQUENCE = [
  { id: "texture", label: "피부 결 분석 중" },
  { id: "elasticity", label: "탄력 계산 중" },
  { id: "wrinkle", label: "주름 패턴 확인 중" },
  { id: "tone", label: "톤 균형 측정 중" },
];

const OX_QUESTIONS: OXQuestion[] = [
  {
    key: "tight_after_wash",
    title: "세안 후 당김이 느껴지나요?",
    description: "O: 자주 느껴진다 / X: 거의 없다",
  },
  {
    key: "makeup_cakey",
    title: "화장이 자주 들뜨거나 갈라지나요?",
    description: "O: 자주 그렇다 / X: 거의 없다",
  },
  {
    key: "elasticity_change",
    title: "탄력이 예전 같지 않다고 느끼나요?",
    description: "O: 예전보다 떨어진 것 같다 / X: 큰 변화 없다",
  },
  {
    key: "skin_sensitive_now",
    title: "피부가 요즘 예민해졌다고 느끼나요?",
    description: "O: 예민해졌다 / X: 평소와 비슷하다",
  },
  {
    key: "no_recent_trouble",
    title: "특별한 트러블은 없나요?",
    description: "O: 크게 없다 / X: 가끔 생긴다",
  },
];

const createInitialStepState = (): StepState => ({
  status: "idle",
  previewUri: null,
  uploadUrl: null,
  message: "촬영을 시작해주세요.",
  quality: null,
});

const createInitialOxAnswers = (): Record<string, OXAnswer> => (
  OX_QUESTIONS.reduce((acc, question) => {
    acc[question.key] = null;
    return acc;
  }, {} as Record<string, OXAnswer>)
);

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
  const [flowStage, setFlowStage] = useState<FlowStage>("intro");
  const [flashVisible, setFlashVisible] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepStates, setStepStates] = useState<StepState[]>(
    STEP_CONFIGS.map(() => createInitialStepState())
  );
  const [globalMessage, setGlobalMessage] = useState(
    "AI 피부 분석을 위한 표준 촬영을 시작해 주세요."
  );
  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStepState[]>(
    ANALYSIS_SEQUENCE.map((step) => ({ ...step, status: "pending" }))
  );
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [oxAnswers, setOxAnswers] = useState<Record<string, OXAnswer>>(createInitialOxAnswers());
  const [oxSubmitting, setOxSubmitting] = useState(false);
  const [oxError, setOxError] = useState<string | null>(null);
  const [oxCompleted, setOxCompleted] = useState(false);

  const analysisTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const stepStatesRef = useRef(stepStates);
  const oxAnswersRef = useRef(oxAnswers);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    stepStatesRef.current = stepStates;
  }, [stepStates]);

  useEffect(() => {
    oxAnswersRef.current = oxAnswers;
  }, [oxAnswers]);

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

  const allOxAnswered = useMemo(
    () => Object.values(oxAnswers).every((value) => value === "O" || value === "X"),
    [oxAnswers]
  );

  useEffect(() => {
    if (flowStage === "capture" && allCompleted) {
      beginAnalysisPhase();
    }
  }, [flowStage, allCompleted]);

  const ensurePermission = async () => {
    if (permission?.granted) return true;
    const response = await requestPermission();
    return response.granted;
  };

  const createAnalysisSession = async () => {
    if (!SERVER_BASE_URL) {
      throw new Error("서버 API 주소가 설정되지 않았습니다.");
    }

    const res = await fetch(`${SERVER_BASE_URL}/api/analysis-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "expo_app", status: "capturing" }),
    });
    const data = await res.json();
    if (!res.ok || !data?.sessionId) {
      throw new Error(data?.error || "세션 생성에 실패했습니다.");
    }
    return data.sessionId as string;
  };

  const updateSessionStatus = async (status: SessionStatus) => {
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
  };

  const refreshServerReport = async (
    options?: { loadingMessage?: string; doneMessage?: string }
  ) => {
    const fallbackToLocalReport = () => {
      const fallback = buildReportFromQuality(
        stepStatesRef.current,
        sessionIdRef.current,
        oxAnswersRef.current
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
        `${SERVER_BASE_URL}/api/analysis-sessions/${sessionIdRef.current}/recommendations`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "리포트 생성에 실패했습니다.");
      }

      setReportData({
        sessionLabel:
          payload.sessionLabel ?? payload.sessionId ?? sessionIdRef.current,
        summary: payload.summary ?? "",
        highlight: payload.highlight ?? "",
        items: Array.isArray(payload.items) ? payload.items : [],
        tips: Array.isArray(payload.tips) ? payload.tips : [],
        needs: Array.isArray(payload.needs) ? payload.needs : [],
        recommendations: Array.isArray(payload.recommendations)
          ? payload.recommendations
          : [],
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
  };

  const openOxStage = () => {
    if (!sessionIdRef.current) {
      setGlobalMessage("세션 정보가 없어 다시 시작해야 합니다.");
      return;
    }
    setFlowStage("ox");
    setGlobalMessage("생활 습관 정보를 입력하면 리포트가 더 정교해집니다.");
    updateSessionStatus("awaiting_ox");
  };

  const returnToReport = () => {
    setFlowStage("report");
    setGlobalMessage("리포트에서 분석 결과를 확인하세요.");
  };

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
      setOxAnswers(createInitialOxAnswers());
      setOxSubmitting(false);
      setOxError(null);
      setOxCompleted(false);
      setGlobalMessage("가이드에 맞춰 기준 촬영부터 진행해주세요.");
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

    if (step.shotType === "base") {
      const minArea = onAndroid ? 6e5 : 1e6;
      const minRatio = onAndroid ? 0.7 : 0.85;
      const maxRatio = onAndroid ? 1.65 : 1.45;
      let passed = area >= minArea && ratio > minRatio && ratio < maxRatio;

      if (!passed && onAndroid && width >= 720 && height >= 960) {
        // 일부 안드로이드 기기에서 해상도는 충분하지만 비율이 조금 어긋나는 이슈가 있어 완화
        passed = true;
      }
      return {
        passed,
        headline: passed ? "분석에 적합한 기준 촬영입니다." : "얼굴이 충분히 채워지지 않았어요.",
        detail: passed
          ? "얼굴 윤곽이 안정적으로 포착되었습니다."
          : onAndroid
            ? "카메라와 얼굴 사이 거리를 조금만 줄여 가이드 원을 채워주세요."
            : "가이드 원 안에 이마와 턱이 모두 들어오도록 한 걸음만 더 다가와 촬영해주세요.",
        tip: "카메라와 눈높이를 맞추고 어깨가 살짝 보이도록 정면을 유지하면 통과 확률이 높아집니다.",
        metrics: { area, ratio },
      };
    }

    const cheekMinArea = onAndroid ? 5e5 : 8.5e5;
    const cheekMinRatio = onAndroid ? 0.9 : 1.0;
    let passed = area >= cheekMinArea && ratio > cheekMinRatio;
    if (!passed && onAndroid && width >= 640 && height >= 900) {
      passed = true;
    }
    return {
      passed,
      headline: passed ? "볼 질감이 잘 잡혔어요." : "볼에 조금만 더 가까이 다가가주세요.",
      detail: passed
        ? "피부 결이 선명하게 보이는 거리입니다."
        : onAndroid
          ? "카메라를 볼에 더 가까이 가져가 화면을 넉넉히 채워주세요."
          : "볼 영역이 프레임의 절반 이상을 차지하도록 화면에 붙는다는 느낌으로 촬영해 주세요.",
      tip: "볼을 프레임 오른쪽 상단에 맞추고, 화면을 넉넉히 채우도록 천천히 접근하세요.",
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

  const submitOxResponses = async () => {
    if (!sessionIdRef.current) {
      setGlobalMessage("세션 정보가 없어 다시 시작이 필요합니다.");
      return;
    }
    if (!allOxAnswered) {
      setOxError("모든 질문에 답변해야 분석을 시작할 수 있습니다.");
      return;
    }

    setOxSubmitting(true);
    setOxError(null);
    setGlobalMessage("응답을 저장하는 중입니다...");

    const payload = Object.entries(oxAnswers).map(([questionKey, answer]) => ({
      question_key: questionKey,
      answer: (answer ?? "O") as "O" | "X",
    }));

    try {
      if (!SERVER_BASE_URL) {
        throw new Error("서버 API 주소가 설정되지 않았습니다.");
      }

      const response = await fetch(`${SERVER_BASE_URL}/api/analysis-sessions/${sessionIdRef.current}/ox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionIdRef.current, responses: payload }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "OX 저장에 실패했습니다.");
      }
      await updateSessionStatus("ox_collected");
      setOxCompleted(true);
      await refreshServerReport({
        loadingMessage: "OX 응답을 반영하는 중입니다...",
        doneMessage: "OX 응답이 반영되었습니다. 리포트를 확인하세요.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "OX 저장에 실패했습니다.";
      setOxError(message);
      setGlobalMessage(message);
    } finally {
      setOxSubmitting(false);
    }
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

    try {
      triggerFlash();
      updateStepState(currentStepIndex, {
        status: "uploading",
        message: "촬영 데이터를 확인하는 중입니다...",
      });

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.95,
        skipProcessing: true,
      });

      const quality = evaluateCaptureQuality(photo, currentStep);
      updateStepState(currentStepIndex, {
        previewUri: photo.uri,
        quality,
        message: quality.headline,
        status: quality.passed ? "uploading" : "error",
      });

      if (!quality.passed) {
        setGlobalMessage(`${quality.detail} 다시 촬영을 권장합니다.`);
        setFlashVisible(false);
        return;
      }

      updateStepState(currentStepIndex, {
        message: "촬영이 통과되었습니다. 업로드 중...",
      });

      let result;
      try {
        result = await uploadViaApi(photo.uri, currentStep);
      } catch (error) {
        if (!isTransientNetworkError(error)) {
          throw error;
        }

        updateStepState(currentStepIndex, {
          message: "네트워크가 잠시 불안정해 한번 더 전송하고 있어요...",
        });
        setGlobalMessage("전송이 끊겨 잠깐 대기 후 다시 시도하는 중입니다.");
        await wait(800);

        result = await uploadViaApi(photo.uri, currentStep);
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

  const beginAnalysisPhase = () => {
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
            refreshServerReport({
              loadingMessage: "1차 리포트를 정리하는 중입니다...",
              doneMessage: "1차 리포트가 준비되었습니다.",
            });
            updateSessionStatus("report_ready");
          }, 1000);
          analysisTimers.current.push(
            finishTimer as ReturnType<typeof setTimeout>
          );
        }
      }, 1600 * (idx + 1));
      analysisTimers.current.push(timer as ReturnType<typeof setTimeout>);
    });
  };

  const isCaptureStage = flowStage === "capture" || flowStage === "intro";

  if (isCaptureStage) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {renderCamera()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flowSafeArea}>
      <ScrollView contentContainerStyle={styles.flowContainer}>
        {flowStage === "ox" && (
          <OXQuestionView
            answers={oxAnswers}
            submitting={oxSubmitting}
            allAnswered={allOxAnswered}
            errorMessage={oxError}
            onAnswer={(key, answer) =>
              setOxAnswers((prev) => ({ ...prev, [key]: answer }))
            }
            onSubmit={submitOxResponses}
            onBack={returnToReport}
          />
        )}

        {flowStage === "analyzing" && (
          <AnalysisProgressView steps={analysisSteps} />
        )}

        {flowStage === "report" && reportData && (
          <ReportView
            data={reportData}
            onRestart={startSession}
            onOpenOx={openOxStage}
            oxCompleted={oxCompleted}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );

  function renderCamera() {
    if (!permission) {
      return (
        <View style={styles.cameraStage}>
          <ActivityIndicator color="#fff" />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.permissionStage}>
          <Text style={styles.permissionText}>
            전면 카메라 접근 권한이 필요합니다.
          </Text>
          <Pressable style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>권한 허용</Text>
          </Pressable>
          <Text style={styles.permissionHint}>
            권한을 허용하면 자동으로 촬영 세션이 시작됩니다.
          </Text>
        </View>
      );
    }

    const cleanedTitle = currentStep.title.replace(/^STEP\\s\\d+\\s·\\s/, "");

    return (
      <View style={styles.cameraStage}>
        <CameraView
          ref={cameraRef}
          style={styles.cameraSurface}
          facing="front"
          ratio="4:3"
        />
        {currentStep.overlay === "base" ? <BaseGuideOverlay /> : <CheekGuideOverlay />}
        {flashVisible && <View style={styles.flashOverlay} pointerEvents="none" />}

        <View style={styles.captureTopBar}>
          <Text style={styles.captureTopLabel}>Tangly 표준 촬영</Text>
          <View style={styles.captureChipRow}>
            {STEP_CONFIGS.map((step, index) => {
              const status = stepStates[index].status;
              const active = index === currentStepIndex;
              const completed = status === "completed";
              return (
                <View
                  key={step.id}
                  style={[
                    styles.captureChip,
                    active && styles.captureChipActive,
                    completed && styles.captureChipDone,
                  ]}
                >
                  <Text style={styles.captureChipStep}>STEP {index + 1}</Text>
                  <Text style={styles.captureChipTitle}>
                    {step.title.replace(/^STEP\\s\\d+\\s·\\s/, "")}
                  </Text>
                  <Text style={styles.captureChipStatus}>{renderStatusLabel(status)}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.captureBottomSheet}>
          <Text style={styles.captureStepLabel}>
            STEP {currentStepIndex + 1} · {cleanedTitle}
          </Text>
          <Text style={styles.captureDescription}>{currentStep.description}</Text>
          <Text
            style={[
              styles.captureStatus,
              currentState.status === "error" && styles.captureStatusError,
            ]}
          >
            {currentState.message}
          </Text>
          {currentState.quality && (
            <Text style={styles.captureTip}>{currentState.quality.tip}</Text>
          )}
          <View style={styles.captureControlsRow}>
            <Pressable
              style={[
                styles.shutterButton,
                isUploading && styles.buttonDisabled,
              ]}
              onPress={handleCapture}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator color="#1f1b2e" />
              ) : (
                <Text style={styles.shutterLabel}>촬영</Text>
              )}
            </Pressable>
            <Pressable
              style={[
                styles.secondaryButton,
                isUploading && styles.buttonDisabled,
              ]}
              onPress={() => resetStep(currentStepIndex)}
              disabled={isUploading}
            >
              <Text style={styles.secondaryButtonText}>다시 촬영</Text>
            </Pressable>
          </View>
          {currentStepIndex < STEP_CONFIGS.length - 1 && (
            <Pressable
              disabled={!isCompleted}
              onPress={moveNextStep}
              style={[
                styles.nextStageButton,
                !isCompleted && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.nextStageText}>다음 단계로 이동</Text>
            </Pressable>
          )}
          <Text style={styles.captureHint}>{globalMessage}</Text>
        </View>
      </View>
    );
  }
}

function renderStatusLabel(status: CaptureState) {
  switch (status) {
    case "completed":
      return "저장 완료";
    case "uploading":
      return "진행 중";
    case "error":
      return "다시 촬영 필요";
    default:
      return "대기 중";
  }
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

const OXQuestionView = ({
  answers,
  submitting,
  allAnswered,
  errorMessage,
  onAnswer,
  onSubmit,
  onBack,
}: {
  answers: Record<string, OXAnswer>;
  submitting: boolean;
  allAnswered: boolean;
  errorMessage: string | null;
  onAnswer: (key: string, answer: "O" | "X") => void;
  onSubmit: () => void;
  onBack: () => void;
}) => (
  <View style={styles.oxCard}>
    <Text style={styles.oxTitle}>간단한 질문에 답해주세요</Text>
    <Text style={styles.oxSubtitle}>
      생활 습관 정보를 함께 확인하면 리포트가 더 정확해져요.
    </Text>
    {OX_QUESTIONS.map((question) => (
      <View key={question.key} style={styles.oxQuestion}>
        <Text style={styles.oxQuestionTitle}>{question.title}</Text>
        <Text style={styles.oxQuestionDesc}>{question.description}</Text>
        <View style={styles.oxAnswerRow}>
          {(["O", "X"] as const).map((option) => {
            const selected = answers[question.key] === option;
            return (
              <Pressable
                key={option}
                style={[
                  styles.oxAnswerButton,
                  selected && styles.oxAnswerSelected,
                ]}
                onPress={() => onAnswer(question.key, option)}
              >
                <Text
                  style={[
                    styles.oxAnswerLabel,
                    selected && styles.oxAnswerLabelSelected,
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    ))}
    {errorMessage && <Text style={styles.oxError}>{errorMessage}</Text>}
    <Pressable
      style={[styles.oxSubmit, (!allAnswered || submitting) && styles.buttonDisabled]}
      disabled={!allAnswered || submitting}
      onPress={onSubmit}
    >
      {submitting ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.oxSubmitText}>분석 시작</Text>
      )}
    </Pressable>
    <Pressable style={styles.oxBack} onPress={onBack}>
      <Text style={styles.oxBackText}>리포트로 돌아가기</Text>
    </Pressable>
  </View>
);

const ReportView = ({
  data,
  onRestart,
  onOpenOx,
  oxCompleted,
}: {
  data: ReportData;
  onRestart: () => void;
  onOpenOx: () => void;
  oxCompleted: boolean;
}) => (
  <View style={styles.reportCard}>
    <Text style={styles.reportTitle}>1차 피부 리포트</Text>
    <Text style={styles.reportSession}>세션: {data.sessionLabel}</Text>
    <Text style={styles.reportSummary}>{data.summary}</Text>
    <Text style={styles.reportHighlight}>{data.highlight}</Text>
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

    <Pressable
      style={[styles.reportOxButton, oxCompleted && styles.buttonDisabled]}
      onPress={onOpenOx}
      disabled={oxCompleted}
    >
      <Text style={styles.reportOxText}>
        {oxCompleted ? "OX 응답이 저장되었습니다" : "생활 습관 OX 입력하기"}
      </Text>
    </Pressable>

    <Pressable style={styles.reportRestart} onPress={onRestart}>
      <Text style={styles.reportRestartText}>새로운 촬영 시작</Text>
    </Pressable>
  </View>
);

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

const BaseGuideOverlay = () => (
  <View pointerEvents="none" style={styles.overlayContainer}>
    <View style={styles.baseGuideCircle} />
    <Text style={styles.overlayText}>얼굴 전체를 가이드 원 안에 맞춰주세요</Text>
  </View>
);

const CheekGuideOverlay = () => (
  <View pointerEvents="none" style={styles.overlayContainer}>
    <View style={styles.cheekGuideCircle} />
    <Text style={styles.overlayText}>볼을 가득 채우도록 가까이 다가가세요</Text>
  </View>
);

const buildReportFromQuality = (
  states: StepState[],
  sessionId: string | null,
  oxAnswers: Record<string, OXAnswer>
): ReportData => {
  const baseQuality = states[0]?.quality;
  const cheekQuality = states[1]?.quality;

  const feelsTight = oxAnswers["tight_after_wash"] === "O";
  const makeupCakey = oxAnswers["makeup_cakey"] === "O";
  const elasticityConcern = oxAnswers["elasticity_change"] === "O";
  const feelsSensitive = oxAnswers["skin_sensitive_now"] === "O";
  const troubleFree = oxAnswers["no_recent_trouble"] === "O";

  const empathyIntro = baseQuality?.passed
    ? "전체적으로 피부 컨디션은 나쁘지 않은 편이에요."
    : "기본 촬영에서 읽히는 정보가 살짝 부족했지만, 지금 피부는 충분히 회복 가능한 상태예요.";

  const photoNarrative = cheekQuality?.passed
    ? "볼 쪽은 아직 탄력이 비교적 잘 유지되고 있어요."
    : "볼 쪽이 예전보다 탄력을 유지하는 힘이 조금 약해진 상태예요.";

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
    if (!cheekQuality?.passed || elasticityConcern || feelsTight) {
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
      description: baseQuality?.passed
        ? "기본 촬영 기준으로 피부 결은 크게 무너지지 않았어요."
        : "기본 촬영 정보가 제한적이라 조심스럽게 안내드릴게요.",
      comparison: troubleFree
        ? "특별한 트러블이 없다는 응답과도 흐름이 비슷해요."
        : "부분적으로 컨디션이 흔들리면 트러블로 번지기 쉬운 시기예요.",
      status: troubleFree ? "좋음" : "보통",
    },
    {
      id: "elasticity",
      title: "탄력",
      description: cheekQuality?.passed
        ? "볼 라인 탄력이 아직은 잘 유지되고 있어요."
        : "볼 라인이 아래로 살짝 끌리는 신호가 보여요.",
      comparison: elasticityConcern
        ? "탄력이 예전 같지 않다는 답변과도 맞물려 보여요."
        : "지금은 급하게 당길 필요는 없어요.",
      status: cheekQuality?.passed && !elasticityConcern ? "보통" : "주의",
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
        level: !cheekQuality?.passed || feelsTight ? "high" : "medium",
        description:
          "이번 기본 리포트는 촬영 결과와 OX 응답을 엮어 현재에 맞는 관리 방향을 제안합니다.",
      },
    ],
    recommendations: [],
  };
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#050109",
  },
  flowSafeArea: {
    flex: 1,
    backgroundColor: "#F6F1FA",
  },
  flowContainer: {
    padding: 20,
    gap: 20,
  },
  cameraStage: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "flex-end",
  },
  cameraSurface: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  permissionStage: {
    flex: 1,
    backgroundColor: "#0E0A18",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  permissionText: {
    color: "#E7DDF3",
    marginBottom: 8,
    textAlign: "center",
    fontSize: 16,
  },
  permissionButton: {
    backgroundColor: "#A884CC",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 999,
  },
  permissionButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  permissionHint: {
    color: "#9F94B9",
    fontSize: 12,
    textAlign: "center",
  },
  overlayContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  baseGuideCircle: {
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.8)",
  },
  cheekGuideCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 4,
    borderColor: "rgba(255,192,203,0.9)",
    transform: [{ translateX: 60 }],
  },
  overlayText: {
    color: "white",
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowRadius: 4,
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
  captureTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 24,
    paddingHorizontal: 20,
    gap: 12,
  },
  captureTopLabel: {
    color: "#DCCEF5",
    fontSize: 13,
    letterSpacing: 0.3,
  },
  captureChipRow: {
    flexDirection: "row",
    gap: 10,
  },
  captureChip: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(8,5,18,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  captureChipActive: {
    borderColor: "#FFFFFF",
    backgroundColor: "rgba(8,5,18,0.75)",
  },
  captureChipDone: {
    backgroundColor: "rgba(168,132,204,0.65)",
    borderColor: "rgba(255,255,255,0.35)",
  },
  captureChipStep: {
    color: "#C9BEDF",
    fontSize: 11,
  },
  captureChipTitle: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 13,
    marginTop: 2,
  },
  captureChipStatus: {
    color: "#D4CCE5",
    fontSize: 11,
    marginTop: 4,
  },
  captureBottomSheet: {
    backgroundColor: "rgba(5,4,11,0.72)",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 36,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 10,
  },
  captureStepLabel: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  captureDescription: {
    color: "#CEC4DF",
  },
  captureStatus: {
    color: "#E4DDF7",
    fontWeight: "600",
  },
  captureStatusError: {
    color: "#F5A8A0",
  },
  captureTip: {
    color: "#CFC3EB",
    fontSize: 12,
  },
  captureControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  shutterButton: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
    flex: 1,
  },
  shutterLabel: {
    fontWeight: "bold",
    color: "#1f1b2e",
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
  secondaryButtonText: {
    color: "white",
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  nextStageButton: {
    backgroundColor: "#A884CC",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  nextStageText: {
    color: "white",
    fontWeight: "700",
  },
  captureHint: {
    color: "#BDB0D4",
    fontSize: 12,
    marginTop: 4,
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
  oxCard: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  oxTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f1b2e",
  },
  oxSubtitle: {
    color: "#4B3A63",
    fontSize: 13,
  },
  oxQuestion: {
    borderWidth: 1,
    borderColor: "#E4DDF7",
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  oxQuestionTitle: {
    fontWeight: "600",
    color: "#1f1b2e",
  },
  oxQuestionDesc: {
    color: "#6A4BA1",
    fontSize: 12,
  },
  oxAnswerRow: {
    flexDirection: "row",
    gap: 10,
  },
  oxAnswerButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D6C7F1",
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
  },
  oxAnswerSelected: {
    backgroundColor: "#A884CC",
    borderColor: "#A884CC",
  },
  oxAnswerLabel: {
    fontWeight: "600",
    color: "#6A4BA1",
  },
  oxAnswerLabelSelected: {
    color: "white",
  },
  oxError: {
    color: "#C0392B",
    fontSize: 12,
  },
  oxSubmit: {
    backgroundColor: "#1f1b2e",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  oxSubmitText: {
    color: "white",
    fontWeight: "700",
  },
  oxBack: {
    marginTop: 8,
    alignItems: "center",
  },
  oxBackText: {
    color: "#6A4BA1",
    fontWeight: "600",
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
  reportOxButton: {
    backgroundColor: "#F3E9FF",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  reportOxText: {
    color: "#5C3AA1",
    fontWeight: "700",
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
