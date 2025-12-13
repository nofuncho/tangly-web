import { useMemo, useRef, useState } from "react";
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

type CaptureState = "idle" | "uploading" | "completed" | "error";

type StepConfig = {
  id: "base" | "cheek";
  title: string;
  description: string;
  shotType: "base" | "cheek";
  focusArea: "cheek" | null;
  overlay: "base" | "cheek";
  highlightColor: string;
};

type StepState = {
  status: CaptureState;
  previewUri: string | null;
  uploadUrl: string | null;
  message: string;
};

const UPLOAD_API_URL = process.env.EXPO_PUBLIC_UPLOAD_API_URL ?? "";

const STEP_CONFIGS: StepConfig[] = [
  {
    id: "base",
    title: "STEP 1 · 기준 얼굴 촬영",
    description: "얼굴 전체가 가이드 안에 들어오도록 정면을 맞춰주세요.",
    shotType: "base",
    focusArea: null,
    overlay: "base",
    highlightColor: "#A884CC",
  },
  {
    id: "cheek",
    title: "STEP 2 · 볼 클로즈업",
    description: "볼에 최대한 가까이 다가가 피부 결이 선명하게 보이도록 촬영하세요.",
    shotType: "cheek",
    focusArea: "cheek",
    overlay: "cheek",
    highlightColor: "#F08DC2",
  },
];

const initialStepState: StepState = {
  status: "idle",
  previewUri: null,
  uploadUrl: null,
  message: "촬영을 시작해주세요.",
};

export default function StepBasedCaptureScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [flashVisible, setFlashVisible] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepStates, setStepStates] = useState<StepState[]>(
    STEP_CONFIGS.map(() => initialStepState)
  );
  const [globalMessage, setGlobalMessage] = useState(
    "AI 피부 진단 이미지를 표준화된 방식으로 촬영합니다."
  );

  const currentStep = STEP_CONFIGS[currentStepIndex];
  const currentState = stepStates[currentStepIndex];
  const isUploading = currentState.status === "uploading";
  const isCompleted = currentState.status === "completed";

  const allCompleted = useMemo(
    () => stepStates.every((state) => state.status === "completed"),
    [stepStates]
  );

  const ensurePermission = async () => {
    if (permission?.granted) return true;
    const response = await requestPermission();
    return response.granted;
  };

  const startSession = async () => {
    const granted = await ensurePermission();
    if (!granted) {
      setGlobalMessage("카메라 권한이 허용되어야 촬영을 진행할 수 있습니다.");
      return;
    }

    setStepStates(STEP_CONFIGS.map(() => initialStepState));
    setCurrentStepIndex(0);
    setIsSessionActive(true);
    setGlobalMessage("얼굴 가이드를 확인하고 기준 촬영을 진행해주세요.");
  };

  const resetStep = (index: number) => {
    setStepStates((prev) => {
      const next = [...prev];
      next[index] = { ...initialStepState };
      return next;
    });
    setGlobalMessage("가이드를 확인한 뒤 다시 촬영해주세요.");
  };

  const triggerFlash = () => {
    setFlashVisible(true);
    setTimeout(() => setFlashVisible(false), 120);
  };

  const uploadViaApi = async (uri: string, step: StepConfig) => {
    if (!UPLOAD_API_URL) {
      throw new Error("EXPO_PUBLIC_UPLOAD_API_URL 값을 설정해주세요.");
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

    try {
      triggerFlash();
      updateStepState(currentStepIndex, {
        status: "uploading",
        message: "촬영 중...",
      });

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.95,
        skipProcessing: true,
      });

      updateStepState(currentStepIndex, {
        previewUri: photo.uri,
        message: "업로드 중...",
      });

      const result = await uploadViaApi(photo.uri, currentStep);
      const publicUrl =
        result?.publicUrl ?? result?.photo?.image_url ?? result?.photo?.image_url;

      updateStepState(currentStepIndex, {
        status: "completed",
        uploadUrl: publicUrl || null,
        message: "촬영 완료! 다음 단계로 이동하세요.",
      });

      setGlobalMessage(
        currentStepIndex === STEP_CONFIGS.length - 1
          ? "모든 촬영이 끝났습니다. 아래 결과를 확인하세요."
          : "촬영이 저장되었습니다. 다음 단계로 이동하세요."
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
    if (currentStepIndex < STEP_CONFIGS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
      setGlobalMessage("가이드에 맞춰 다음 촬영을 진행해주세요.");
    }
  };

  const renderOverlay = () => {
    if (currentStep.overlay === "base") {
      return <BaseGuideOverlay />;
    }
    return <CheekGuideOverlay />;
  };

  const renderCamera = () => {
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
        {renderOverlay()}
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
            style={styles.closeButton}
            onPress={() => resetStep(currentStepIndex)}
            disabled={isUploading}
          >
            <Text style={styles.closeButtonText}>다시 촬영</Text>
          </Pressable>
        </View>
      </View>
    );
  };

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
            <Text style={styles.ctaLabel}>
              {isSessionActive ? "세션 다시 시작하기" : "촬영 세션 시작"}
            </Text>
          </Pressable>
          <Text style={styles.heroHint}>{globalMessage}</Text>
        </View>

        {isSessionActive && (
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
                style={[
                  styles.nextButton,
                  !isCompleted && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.nextButtonText}>
                  다음 단계로 이동 ({currentStepIndex + 2}/
                  {STEP_CONFIGS.length})
                </Text>
              </Pressable>
            )}
            {allCompleted && (
              <View style={styles.successCard}>
                <Text style={styles.successTitle}>모든 촬영이 완료되었습니다.</Text>
                <Text style={styles.successBody}>
                  Supabase Storage와 photos 테이블에 base / cheek 메타 정보가 구분되어
                  저장되었습니다.
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.summarySection}>
          <Text style={styles.summaryTitle}>촬영 진행 현황</Text>
          {STEP_CONFIGS.map((step, index) => {
            const state = stepStates[index];
            return (
              <View key={step.id} style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <View
                    style={[
                      styles.summaryBadge,
                      { backgroundColor: step.highlightColor },
                    ]}
                  >
                    <Text style={styles.summaryBadgeText}>{step.id}</Text>
                  </View>
                  <Text style={styles.summaryStepTitle}>{step.title}</Text>
                </View>
                <Text style={styles.summaryStatus}>
                  상태:{" "}
                  {state.status === "completed"
                    ? "저장 완료"
                    : state.status === "uploading"
                      ? "업로드 중"
                      : state.status === "error"
                        ? "오류 발생"
                        : "대기 중"}
                </Text>
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
  },
  statusLabel: {
    color: "#4B3A63",
  },
  statusError: {
    color: "#C0392B",
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
  successCard: {
    backgroundColor: "#E6F8F0",
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  successTitle: {
    fontWeight: "bold",
    color: "#117A65",
  },
  successBody: {
    color: "#117A65",
    fontSize: 13,
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
