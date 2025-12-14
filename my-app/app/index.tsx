import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
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

type ReportData = {
  sessionLabel: string;
  summary: string;
  highlight: string;
  items: ReportItem[];
  tips: string[];
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
    } catch (error) {
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
    key: "sensitive_skin",
    title: "최근 2주 동안 피부가 예민하거나 따가웠나요?",
    description: "O: 자주 그렇다 / X: 거의 없다",
  },
  {
    key: "frequent_makeup",
    title: "평소 메이크업을 자주 하나요?",
    description: "O: 주 4회 이상 / X: 주 3회 이하",
  },
  {
    key: "daily_sunscreen",
    title: "외출 시 자외선 차단제를 항상 바르나요?",
    description: "O: 거의 매번 사용 / X: 가끔 또는 거의 사용하지 않음",
  },
  {
    key: "recent_skin_trouble",
    title: "최근 일주일 내 여드름/트러블이 있었나요?",
    description: "O: 있다 / X: 없다",
  },
  {
    key: "oiliness_high",
    title: "피부 유분이 많은 편인가요?",
    description: "O: 번들거림이 느껴진다 / X: 건조하거나 보통",
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

    if (step.shotType === "base") {
      const passed = area >= 1e6 && ratio > 0.85 && ratio < 1.45;
      return {
        passed,
        headline: passed ? "분석에 적합한 기준 촬영입니다." : "얼굴이 충분히 채워지지 않았어요.",
        detail: passed
          ? "얼굴 윤곽이 안정적으로 포착되었습니다."
          : "가이드 원 안에 이마와 턱이 모두 들어오도록 한 걸음만 더 다가와 촬영해주세요.",
        tip: "카메라와 눈높이를 맞추고 어깨가 살짝 보이도록 정면을 유지하면 통과 확률이 높아집니다.",
        metrics: { area, ratio },
      };
    }

    const passed = area >= 8.5e5 && ratio > 1.0;
    return {
      passed,
      headline: passed ? "볼 질감이 잘 잡혔어요." : "볼에 조금만 더 가까이 다가가주세요.",
      detail: passed
        ? "피부 결이 선명하게 보이는 거리입니다."
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
    formData.append("file", {
      uri,
      name: `${step.id}-${Date.now()}.jpg`,
      type: "image/jpeg",
    } as any);
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
      const refreshedReport = buildReportFromQuality(
        stepStatesRef.current,
        sessionIdRef.current,
        oxAnswersRef.current
      );
      setReportData(refreshedReport);
      setFlowStage("report");
      setGlobalMessage("OX 응답이 반영되었습니다. 리포트를 확인하세요.");
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

      const result = await uploadViaApi(photo.uri, currentStep);
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
            const report = buildReportFromQuality(
              stepStatesRef.current,
              sessionIdRef.current,
              oxAnswersRef.current
            );
            setReportData(report);
            setFlowStage("report");
            setGlobalMessage("1차 리포트가 준비되었습니다.");
            updateSessionStatus("report_ready");
          }, 1000);
          analysisTimers.current.push(finishTimer as ReturnType<typeof setTimeout>);
        }
      }, 1600 * (idx + 1));
      analysisTimers.current.push(timer as ReturnType<typeof setTimeout>);
    });
  };

  const heroButtonLabel =
    flowStage === "intro"
      ? "촬영 세션 시작"
      : flowStage === "capture"
        ? "세션 다시 시작하기"
        : "새로운 세션 시작";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <Text style={styles.bannerTitle}>Tangly 촬영 가이드</Text>
          <Text style={styles.bannerDescription}>
            표준화된 두 단계 촬영으로 AI 분석에 필요한 이미지를 확보합니다.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.ctaButton,
              pressed && styles.ctaButtonPressed,
            ]}
            onPress={startSession}
          >
            <Text style={styles.ctaLabel}>{heroButtonLabel}</Text>
          </Pressable>
          <Text style={styles.heroHint}>{globalMessage}</Text>
        </View>

        {flowStage === "capture" && (
          <View style={styles.stepContainer}>
            <StepIndicator
              steps={STEP_CONFIGS}
              stepStates={stepStates}
              currentIndex={currentStepIndex}
            />
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>{currentStep.title}</Text>
              <Text style={styles.stepDescription}>{currentStep.description}</Text>
            </View>

            {renderCamera()}

            <View style={styles.statusCard}>
              <Text
                style={[
                  styles.statusLabel,
                  currentState.status === "error" && styles.statusError,
                ]}
              >
                {currentState.message}
              </Text>
              {currentState.quality && (
                <Text style={styles.statusTip}>{currentState.quality.tip}</Text>
              )}
            </View>

            {currentState.uploadUrl && (
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>업로드된 사진</Text>
                <Image
                  source={{ uri: currentState.previewUri ?? currentState.uploadUrl }}
                  style={styles.previewImage}
                />
                <Text style={styles.previewHint}>shot_type: {currentStep.shotType}</Text>
                {currentState.uploadUrl && (
                  <Text style={styles.previewUrl} numberOfLines={1}>
                    {currentState.uploadUrl}
                  </Text>
                )}
              </View>
            )}

            {currentStepIndex < STEP_CONFIGS.length - 1 && (
              <Pressable
                disabled={!isCompleted}
                onPress={moveNextStep}
                style={[styles.nextButton, !isCompleted && styles.buttonDisabled]}
              >
                <Text style={styles.nextButtonText}>
                  다음 단계로 이동 ({currentStepIndex + 2}/{STEP_CONFIGS.length})
                </Text>
              </Pressable>
            )}
          </View>
        )}

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

        <View style={styles.summarySection}>
          <Text style={styles.summaryTitle}>촬영 진행 현황</Text>
          {STEP_CONFIGS.map((step, index) => {
            const state = stepStates[index];
            return (
              <View key={step.id} style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <View
                    style={[styles.summaryBadge, { backgroundColor: step.highlightColor }]}
                  >
                    <Text style={styles.summaryBadgeText}>{step.id}</Text>
                  </View>
                  <Text style={styles.summaryStepTitle}>{step.title}</Text>
                </View>
                <Text style={styles.summaryStatus}>
                  상태: {renderStatusLabel(state.status)}
                </Text>
                {state.quality && (
                  <Text style={styles.summaryTip} numberOfLines={2}>
                    품질: {state.quality.headline}
                  </Text>
                )}
                {state.uploadUrl && (
                  <Text style={styles.summaryUrl} numberOfLines={1}>
                    {state.uploadUrl}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  function renderCamera() {
    if (!permission) {
      return <View style={styles.permissionCard} />;
    }

    if (!permission.granted) {
      return (
        <View style={styles.permissionCard}>
          <Text style={styles.permissionText}>
            전면 카메라 접근 권한이 필요합니다.
          </Text>
          <Pressable style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>권한 허용</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.cameraWrapper}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="front"
          ratio="4:3"
        />
        {currentStep.overlay === "base" ? <BaseGuideOverlay /> : <CheekGuideOverlay />}
        {flashVisible && <View style={styles.flashOverlay} pointerEvents="none" />}

        <View style={styles.cameraControls}>
          <Pressable
            style={({ pressed }) => [
              styles.shutterButton,
              pressed && styles.shutterPressed,
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
            style={[styles.closeButton, isUploading && styles.buttonDisabled]}
            onPress={() => resetStep(currentStepIndex)}
            disabled={isUploading}
          >
            <Text style={styles.closeButtonText}>다시 촬영</Text>
          </Pressable>
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

function StepIndicator({
  steps,
  stepStates,
  currentIndex,
}: {
  steps: StepConfig[];
  stepStates: StepState[];
  currentIndex: number;
}) {
  return (
    <View style={styles.stepper}>
      {steps.map((step, index) => {
        const completed = stepStates[index].status === "completed";
        const active = index === currentIndex;
        return (
          <View key={step.id} style={styles.stepperItem}>
            <View
              style={[
                styles.stepCircle,
                completed && styles.stepCircleCompleted,
                active && styles.stepCircleActive,
              ]}
            >
              <Text
                style={[
                  styles.stepCircleText,
                  (completed || active) && styles.stepCircleTextActive,
                ]}
              >
                {index + 1}
              </Text>
            </View>
            {index < steps.length - 1 && <View style={styles.stepLine} />}
          </View>
        );
      })}
    </View>
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

  const sensitive = oxAnswers["sensitive_skin"] === "O";
  const sunscreen = oxAnswers["daily_sunscreen"] === "O";
  const frequentMakeup = oxAnswers["frequent_makeup"] === "O";
  const recentTrouble = oxAnswers["recent_skin_trouble"] === "O";
  const oily = oxAnswers["oiliness_high"] === "O";

  const summaryParts = [] as string[];
  if (baseQuality?.passed) {
    summaryParts.push("기준 촬영이 안정적으로 확보되어 전체 피부 톤을 읽을 수 있었어요.");
  } else {
    summaryParts.push("기준 촬영 정보가 다소 제한적이라 얼굴 전체 톤은 보수적으로 해석합니다.");
  }
  if (recentTrouble) {
    summaryParts.push("최근 트러블이 있다고 답해주셔서 해당 부위에 자극 완화 팁을 포함했어요.");
  }

  const summary = summaryParts.join(" ") || "촬영이 정상적으로 완료되었습니다.";

  const highlight = sensitive
    ? "예민한 피부 특성이 있어 진정 케어를 함께 권장합니다."
    : cheekQuality?.passed
      ? "볼 피부 결은 평균 범위 안쪽이지만 보습 후 재측정을 권장합니다."
      : "볼 피부 결 분석을 위해 조금 더 가까운 촬영이 필요했어요.";

  const items: ReportItem[] = [
    {
      id: "texture",
      title: "피부 결",
      description: cheekQuality?.passed
        ? "볼 피부 결이 비교적 균일하게 촬영되었습니다."
        : "볼 부위가 흐릿해 결이 거칠게 인식될 수 있어요.",
      comparison: cheekQuality?.passed
        ? oily
          ? "유분이 많아 결이 조금 두꺼워질 수 있음"
          : "동연령 평균 대비 보통"
        : "평균 대비 약간 낮음",
      status: cheekQuality?.passed && !oily ? "보통" : "주의",
    },
    {
      id: "pore",
      title: "모공",
      description: frequentMakeup
        ? "메이크업 빈도가 높아 모공 케어 메시지를 강화했습니다."
        : "T존 모공 분포가 일정하며 급격한 확장은 보이지 않습니다.",
      comparison: frequentMakeup ? "클렌징 필요성이 다소 높음" : "평균 대비 약간 촘촘",
      status: frequentMakeup ? "주의" : "좋음",
    },
    {
      id: "elasticity",
      title: "탄력",
      description: baseQuality?.passed
        ? "얼굴 윤곽이 안정적으로 촬영되어 탄력 지표가 고르게 나타납니다."
        : "기준 촬영이 멀어 탄력 지표를 보수적으로 해석합니다.",
      comparison: baseQuality?.passed ? "평균 대비 비슷" : "평균 대비 약간 낮음",
      status: baseQuality?.passed ? "보통" : "주의",
    },
    {
      id: "sagging",
      title: "처짐",
      description: sensitive
        ? "예민한 피부 특성을 고려해 처짐 코멘트를 완만하게 제시합니다."
        : "광대 아래 영역의 톤 변화가 크지 않아 아직 큰 처짐 징후는 보이지 않습니다.",
      comparison: sensitive ? "자극에 따라 변동 가능" : "동연령 대비 안정적",
      status: "좋음",
    },
    {
      id: "wrinkle",
      title: "주름",
      description: sunscreen
        ? "자외선 차단 습관 덕분에 주름 진행이 완만할 가능성이 높습니다."
        : "자외선 차단이 부족해 미세 주름이 빠르게 늘 수 있으니 주의를 권장합니다.",
      comparison: sunscreen ? "평균 대비 양호" : "평균 대비 다소 민감",
      status: sunscreen ? "좋음" : "주의",
    },
  ];

  const tips = [
    recentTrouble
      ? "트러블 부위는 강한 각질 제거 대신 진정 앰플을 사용해 주세요."
      : "볼 집중 보습 후 1주일 내 재촬영하면 변화를 더 잘 볼 수 있어요.",
    sunscreen
      ? "자외선 차단제 사용을 꾸준히 유지하면 탄력 항목이 안정적으로 유지됩니다."
      : "외출 15분 전에 자외선 차단제를 꼭 바르는 습관을 들여 주세요.",
  ];

  return {
    sessionLabel: sessionId ?? "임시 세션",
    summary,
    highlight,
    items,
    tips,
  };
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F6F1FA",
  },
  container: {
    padding: 20,
    gap: 20,
  },
  heroCard: {
    backgroundColor: "#1f1b2e",
    borderRadius: 24,
    padding: 20,
    gap: 12,
  },
  bannerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
  },
  bannerDescription: {
    color: "white",
    opacity: 0.8,
  },
  heroHint: {
    color: "#E7DDF3",
    fontSize: 13,
    lineHeight: 18,
  },
  ctaButton: {
    backgroundColor: "#A884CC",
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: "center",
  },
  ctaButtonPressed: {
    opacity: 0.85,
  },
  ctaLabel: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  stepContainer: {
    gap: 16,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepperItem: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#E0D5F3",
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleActive: {
    borderColor: "#A884CC",
  },
  stepCircleCompleted: {
    backgroundColor: "#A884CC",
    borderColor: "#A884CC",
  },
  stepCircleText: {
    fontWeight: "bold",
    color: "#A884CC",
  },
  stepCircleTextActive: {
    color: "white",
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#E0D5F3",
    marginHorizontal: 4,
  },
  stepHeader: {
    gap: 6,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f1b2e",
  },
  stepDescription: {
    fontSize: 14,
    color: "#4B3A63",
  },
  cameraWrapper: {
    height: 420,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
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
  cameraControls: {
    position: "absolute",
    bottom: 24,
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  shutterButton: {
    backgroundColor: "#FFFFFF",
    width: 140,
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
  },
  shutterPressed: {
    transform: [{ scale: 0.98 }],
  },
  shutterLabel: {
    fontWeight: "bold",
    color: "#1f1b2e",
  },
  closeButton: {
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
  },
  closeButtonText: {
    color: "white",
    fontWeight: "700",
  },
  statusCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "white",
    gap: 6,
  },
  statusLabel: {
    color: "#4B3A63",
    fontWeight: "600",
  },
  statusError: {
    color: "#C0392B",
  },
  statusTip: {
    fontSize: 12,
    color: "#6A4BA1",
  },
  previewCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  previewTitle: {
    fontWeight: "bold",
    fontSize: 15,
  },
  previewImage: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: "#000",
  },
  previewHint: {
    fontSize: 12,
    color: "#6A4BA1",
  },
  previewUrl: {
    fontSize: 12,
    color: "#6A4BA1",
  },
  nextButton: {
    backgroundColor: "#1f1b2e",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  nextButtonText: {
    color: "white",
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
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
  summarySection: {
    gap: 12,
  },
  summaryTitle: {
    fontWeight: "bold",
    fontSize: 16,
    color: "#1f1b2e",
  },
  summaryCard: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  summaryBadgeText: {
    color: "white",
    fontWeight: "600",
  },
  summaryStepTitle: {
    fontWeight: "600",
    color: "#1f1b2e",
  },
  summaryStatus: {
    color: "#4B3A63",
  },
  summaryTip: {
    fontSize: 12,
    color: "#78738C",
  },
  summaryUrl: {
    fontSize: 12,
    color: "#6A4BA1",
  },
  permissionCard: {
    height: 420,
    borderRadius: 24,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  permissionText: {
    color: "#4B3A63",
    marginBottom: 16,
    textAlign: "center",
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
});
