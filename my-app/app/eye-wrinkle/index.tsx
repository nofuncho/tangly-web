import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";

import { SERVER_BASE_URL, UPLOAD_API_URL } from "@/lib/server";

type FlowStage = "capture" | "analyzing" | "result";
type SessionStatus = "capturing" | "analyzing" | "report_ready";

type StepConfig = {
  id: "open" | "closed";
  title: string;
  description: string;
  guidance: string;
};

type StepState = {
  previewUri: string | null;
  uploaded: boolean;
};

type WrinkleMetric = {
  id: string;
  label: string;
  score: number;
  status: "양호" | "주의";
  detail: string;
};

const STEP_CONFIGS: StepConfig[] = [
  {
    id: "open",
    title: "STEP 1 · 눈 뜬 사진",
    description: "눈을 크게 뜨고 정면을 바라보며 촬영해 주세요.",
    guidance: "눈썹 위쪽까지 프레임 안으로 들어오도록 맞춰 주세요.",
  },
  {
    id: "closed",
    title: "STEP 2 · 눈 감은 사진",
    description: "눈을 부드럽게 감고 표정을 힘주지 않은 상태로 촬영하세요.",
    guidance: "눈가 주름이 선명하게 보일 수 있게 얼굴을 조금 더 가까이 해주세요.",
  },
];

const WRINKLE_METRICS: WrinkleMetric[] = [
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

const TIPS = [
  "저녁 루틴에서는 아이크림을 두껍게 올린 뒤 5분 정도 흡수시키면 주름이 덜 눈에 띕니다.",
  "눈 주위 림프를 따라 가볍게 마사지하면 붓기와 주름이 함께 완화돼요.",
  "외출 전에는 자외선 차단제를 눈꼬리까지 꼼꼼히 바르세요.",
];

const createStepStates = () => STEP_CONFIGS.map(() => ({ previewUri: null, uploaded: false }));

export default function EyeWrinkleScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [flowStage, setFlowStage] = useState<FlowStage>("capture");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepStates, setStepStates] = useState<StepState[]>(createStepStates());
  const [analyzingMessage, setAnalyzingMessage] = useState("눈가 주름 패턴을 분석하는 중입니다...");
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [uploadingStep, setUploadingStep] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const prepareSession = useCallback(async () => {
    if (!SERVER_BASE_URL) {
      setSessionError("서버 주소가 설정되지 않았습니다.");
      return;
    }
    try {
      setCreatingSession(true);
      setSessionError(null);
      const response = await fetch(`${SERVER_BASE_URL}/api/analysis-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "eye_wrinkle", status: "capturing" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.sessionId) {
        throw new Error(payload?.error ?? "세션 생성에 실패했습니다.");
      }
      sessionIdRef.current = payload.sessionId;
      setCompletedSessionId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "세션 생성 중 문제가 발생했습니다.";
      setSessionError(message);
    } finally {
      setCreatingSession(false);
    }
  }, []);

  useEffect(() => {
    prepareSession();
  }, [prepareSession]);

  const ensureSession = async () => {
    if (sessionIdRef.current) {
      return true;
    }
    await prepareSession();
    return !!sessionIdRef.current;
  };

  const updateSessionStatus = async (status: SessionStatus) => {
    if (!sessionIdRef.current || !SERVER_BASE_URL) return;
    try {
      await fetch(`${SERVER_BASE_URL}/api/analysis-sessions/${sessionIdRef.current}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch (error) {
      console.warn("Failed to update session status", error);
    }
  };

  const uploadEyePhoto = async (uri: string, step: StepConfig) => {
    if (!UPLOAD_API_URL) {
      throw new Error("업로드 API 주소가 설정되지 않았습니다.");
    }
    if (!sessionIdRef.current) {
      throw new Error("세션 정보가 없어 업로드할 수 없습니다.");
    }
    const formData = new FormData();
    formData.append(
      "file",
      {
        uri,
        name: `${step.id}-${Date.now()}.jpg`,
        type: "image/jpeg",
      } as unknown as Blob
    );
    const shotType = step.id === "open" ? "eye_open" : "eye_closed";
    formData.append("shot_type", shotType);
    formData.append("focus_area", step.id === "open" ? "eyes_open" : "eyes_closed");
    formData.append("session_id", sessionIdRef.current);

    const response = await fetch(UPLOAD_API_URL, {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error ?? "업로드에 실패했습니다.");
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    if (!(await ensureSession())) {
      setUploadError("세션을 준비하지 못했습니다. 네트워크 상태를 확인해주세요.");
      return;
    }
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: true,
      });
      setStepStates((prev) => {
        const next = [...prev];
        next[currentStepIndex] = { previewUri: photo.uri, uploaded: false };
        return next;
      });
      setUploadingStep(currentStepIndex);
      setUploadError(null);
      let uploadSucceeded = false;
      try {
        await uploadEyePhoto(photo.uri, STEP_CONFIGS[currentStepIndex]);
        uploadSucceeded = true;
        setStepStates((prev) => {
          const next = [...prev];
          const current = next[currentStepIndex];
          next[currentStepIndex] = { ...current, uploaded: true };
          return next;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "촬영 이미지를 저장하지 못했습니다.";
        setUploadError(message);
      } finally {
        setUploadingStep(null);
      }
      if (uploadSucceeded && currentStepIndex < STEP_CONFIGS.length - 1) {
        setCurrentStepIndex((prev) => prev + 1);
      }
    } catch (error) {
      console.warn("Failed to capture eye photo", error);
      setUploadError("촬영에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const beginAnalysis = () => {
    setFlowStage("analyzing");
    updateSessionStatus("analyzing");
    setAnalyzingMessage("눈 주름을 정밀하게 비교하고 있어요...");
    setTimeout(() => {
      setAnalyzingMessage("부위별 탄성과 깊이를 정리하고 있어요...");
    }, 1500);
    setTimeout(() => {
      setFlowStage("result");
      updateSessionStatus("report_ready");
      setCompletedSessionId(sessionIdRef.current);
    }, 2800);
  };

  const handleReset = () => {
    setStepStates(createStepStates());
    setCurrentStepIndex(0);
    setFlowStage("capture");
    setAnalyzingMessage("눈가 주름 패턴을 분석하는 중입니다...");
     setUploadError(null);
     setCompletedSessionId(null);
     sessionIdRef.current = null;
     prepareSession();
  };

  const currentStep = STEP_CONFIGS[currentStepIndex];
  const readyToAnalyze = stepStates.every((step) => step.uploaded);
  const handlePreviousStep = () => {
    if (currentStepIndex === 0) return;
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  };

  const isFirstStep = currentStepIndex === 0;
  const isUploading = uploadingStep !== null;
  const disablePrevButton = isFirstStep || isUploading || creatingSession;
  const captureDisabled = !permission?.granted || isUploading || creatingSession;

  const handleOpenReport = () => {
    if (!completedSessionId) return;
    router.push({
      pathname: "/reports/[id]",
      params: {
        id: completedSessionId,
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>눈 주름 스캔</Text>
        <Text style={styles.headerSubtitle}>STEP 1과 STEP 2를 차례로 촬영해 주세요.</Text>
      </View>

      {flowStage === "capture" && (
        <View style={styles.captureSection}>
          <View style={styles.stepIndicator}>
            <Text style={styles.stepText}>
              {currentStepIndex + 1}/{STEP_CONFIGS.length}
            </Text>
            <Text style={styles.stepTitle}>{currentStep.title}</Text>
            <Text style={styles.stepDescription}>{currentStep.description}</Text>
          </View>

          <View style={styles.cameraWrapper}>
            {permission?.granted ? (
              <CameraView style={StyleSheet.absoluteFill} ref={cameraRef} facing="front" />
            ) : (
              <View style={styles.cameraPermissionBlock}>
                <Text style={styles.permissionText}>카메라 권한을 허용해 주세요.</Text>
                <Pressable style={styles.permissionButton} onPress={requestPermission}>
                  <Text style={styles.permissionButtonText}>권한 허용하기</Text>
                </Pressable>
              </View>
            )}
            <View style={styles.eyeGuide}>
              <View style={styles.eyeGuideCircle} />
              <Text style={styles.eyeGuideLabel}>{currentStep.guidance}</Text>
            </View>
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.ghostButton, disablePrevButton && styles.ghostButtonDisabled]}
              onPress={handlePreviousStep}
              disabled={disablePrevButton}
            >
              <Text style={[styles.ghostButtonText, disablePrevButton && styles.ghostButtonTextDisabled]}>이전으로</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, captureDisabled && styles.primaryButtonDisabled]}
              onPress={handleCapture}
              disabled={captureDisabled}
            >
              {isUploading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>사진 찍기</Text>}
            </Pressable>
          </View>
          {(sessionError || uploadError) && (
            <Text style={styles.errorText}>{sessionError ?? uploadError}</Text>
          )}
        </View>
      )}

      {flowStage === "analyzing" && (
        <View style={styles.analyzingSection}>
          <ActivityIndicator size="large" color="#A884CC" />
          <Text style={styles.analyzingText}>{analyzingMessage}</Text>
        </View>
      )}

      {flowStage === "result" && (
        <ScrollView contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.resultTitle}>눈가 주름 리포트</Text>
          <View style={styles.metricRow}>
            {WRINKLE_METRICS.map((metric) => (
              <View key={metric.id} style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                  <Text style={metric.status === "주의" ? styles.metricStatusWarning : styles.metricStatusGood}>
                    {metric.status}
                  </Text>
                </View>
                <Text style={styles.metricScore}>{metric.score}점</Text>
                <Text style={styles.metricDetail}>{metric.detail}</Text>
              </View>
            ))}
          </View>
          <View style={styles.tipCard}>
            <Text style={styles.tipTitle}>케어 제안</Text>
            {TIPS.map((tip) => (
              <Text key={tip} style={styles.tipItem}>
                • {tip}
              </Text>
            ))}
          </View>
          {completedSessionId && (
            <Pressable style={styles.primaryFullButton} onPress={handleOpenReport}>
              <Text style={styles.primaryButtonText}>리포트에서 보기</Text>
            </Pressable>
          )}
          <Pressable style={styles.secondaryButton} onPress={handleReset}>
            <Text style={styles.secondaryButtonText}>다시 촬영하기</Text>
          </Pressable>
        </ScrollView>
      )}

      {flowStage === "capture" && readyToAnalyze && (
        <Pressable style={styles.analyzePrompt} onPress={beginAnalysis}>
          <Text style={styles.analyzePromptText}>촬영 완료 · 주름 분석 시작</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1F1F24",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#6F6F73",
    marginTop: 4,
  },
  captureSection: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  stepIndicator: {
    marginTop: 20,
    marginBottom: 12,
  },
  stepText: {
    fontSize: 14,
    color: "#A884CC",
    fontWeight: "600",
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F1F24",
    marginTop: 4,
  },
  stepDescription: {
    fontSize: 14,
    color: "#4A4A55",
    marginTop: 8,
  },
  cameraWrapper: {
    height: 360,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#000",
    marginTop: 12,
  },
  cameraPermissionBlock: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: "#1C1C22",
  },
  permissionText: {
    color: "#FFFFFF",
    fontSize: 16,
    marginBottom: 16,
  },
  permissionButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  eyeGuide: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  eyeGuideCircle: {
    width: "100%",
    height: 110,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.7)",
    borderRadius: 80,
    marginBottom: 12,
  },
  eyeGuideLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  ghostButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "rgba(168,132,204,0.12)",
  },
  ghostButtonDisabled: {
    backgroundColor: "#F1EEF6",
  },
  ghostButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#715993",
  },
  ghostButtonTextDisabled: {
    color: "#B9ADC9",
  },
  primaryButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#A884CC",
  },
  primaryButtonDisabled: {
    backgroundColor: "#D1C1E6",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  primaryFullButton: {
    marginTop: 20,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#A884CC",
  },
  analyzingSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  analyzingText: {
    marginTop: 18,
    fontSize: 16,
    textAlign: "center",
    color: "#4A4A55",
  },
  resultContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1F1F24",
    marginBottom: 16,
  },
  metricRow: {
    gap: 12,
  },
  metricCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#EFE7FB",
    padding: 16,
    gap: 6,
  },
  metricHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 15,
    color: "#1F1F24",
  },
  metricStatusGood: {
    fontSize: 13,
    color: "#4CAF50",
  },
  metricStatusWarning: {
    fontSize: 13,
    color: "#D93A5E",
  },
  metricScore: {
    fontSize: 26,
    fontWeight: "700",
    color: "#A884CC",
  },
  metricDetail: {
    fontSize: 13,
    color: "#4A4A55",
    lineHeight: 18,
  },
  tipCard: {
    marginTop: 20,
    borderRadius: 18,
    backgroundColor: "#F6F3FB",
    padding: 18,
    gap: 4,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F1F24",
    marginBottom: 6,
  },
  tipItem: {
    fontSize: 14,
    color: "#4A4A55",
  },
  errorText: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 13,
    color: "#D6455D",
  },
  secondaryButton: {
    marginTop: 24,
    alignSelf: "center",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#A884CC",
  },
  secondaryButtonText: {
    color: "#A884CC",
    fontWeight: "600",
  },
  analyzePrompt: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: "#1F1F24",
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
  },
  analyzePromptText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
