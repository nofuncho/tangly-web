import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  LayoutRectangle,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";

import { SERVER_BASE_URL, UPLOAD_API_URL } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { optimizePhoto, type NormalizedCropRegion } from "@/lib/photo-utils";
import { useRequireProfileDetails } from "@/hooks/use-profile-details";
import type { AiReportContent } from "@/lib/ai-report";

type FlowStage = "capture" | "analyzing" | "result";

type StepConfig = {
  id: "overview" | "detail";
  title: string;
  description: string;
  guidance: string;
  shotType: "trouble_overview" | "trouble_detail";
  focusArea: "trouble_face" | "trouble_closeup";
};

type StepState = {
  previewUri: string | null;
  uploaded: boolean;
};

type FindingCard = {
  id: string;
  label: string;
  severity: "주의" | "보통" | "좋음";
  description: string;
  tips?: string[];
};

type CameraLayout = {
  width: number;
  height: number;
};

const STEP_CONFIGS: StepConfig[] = [
  {
    id: "overview",
    title: "STEP 1 · 트러블 전체 촬영",
    description: "고개를 정면으로 두고 트러블이 있는 부위를 가이드 안에 넣어주세요.",
    guidance: "가이드를 가득 채우는 위치에서 촬영하면 분석이 빨라요.",
    shotType: "trouble_overview",
    focusArea: "trouble_face",
  },
  {
    id: "detail",
    title: "STEP 2 · 트러블 근접 촬영",
    description: "문제 부위에 조금 더 가까이 다가가 결까지 담아주세요.",
    guidance: "가이드를 트러블 중심에 맞추고 초점을 잠시 맞춘 뒤 촬영해 주세요.",
    shotType: "trouble_detail",
    focusArea: "trouble_closeup",
  },
];

const FALLBACK_FINDINGS: FindingCard[] = [
  {
    id: "acne",
    label: "염증성 트러블",
    severity: "주의",
    description: "붉고 부풀어 오른 형태가 포착되어 즉각적인 진정 케어가 필요해요.",
    tips: [
      "과도한 마찰을 피하고 젠틀한 세안제를 사용하세요.",
      "BHA 또는 살리실산 토너로 각질을 정돈하면 진정에 도움이 됩니다.",
      "외출 전엔 유분을 눌러주는 논코메도제닉 제품을 사용하세요.",
    ],
  },
  {
    id: "postInflammation",
    label: "염증 후 색소침착",
    severity: "보통",
    description: "트러블 주변에 갈색의 어두운 자국이 남아 있어 색소 완화 케어가 필요해요.",
    tips: [
      "저녁 루틴에 비타민 C 나이아신아마이드를 추가하세요.",
      "자외선 차단제를 꾸준히 발라 색 변화를 최소화하세요.",
    ],
  },
];

const FALLBACK_ACTIONS = [
  {
    title: "SOS 진정 루틴",
    description: "세안 후 수분 토너 → 시카 앰플 → 진정 크림 순으로 즉시 열감을 내려주세요.",
    frequency: "daily",
  },
  {
    title: "색소 케어",
    description: "저녁에 비타민 C 세럼을 바르고 충분히 보습해 색소 침착을 완화하세요.",
    frequency: "three_per_week",
  },
];

const CAMERA_ASPECT_RATIO = 4 / 3;
const GUIDE_WIDTH = 240;
const GUIDE_HEIGHT = 240;

const computePreviewRect = (layout: CameraLayout, aspectRatio?: number) => {
  const targetRatio = aspectRatio && aspectRatio > 0 ? aspectRatio : CAMERA_ASPECT_RATIO;
  const viewRatio = layout.width / layout.height;
  if (viewRatio > targetRatio) {
    const previewHeight = layout.height;
    const previewWidth = previewHeight * targetRatio;
    const offsetX = (layout.width - previewWidth) / 2;
    return { x: offsetX, y: 0, width: previewWidth, height: previewHeight };
  }
  const previewWidth = layout.width;
  const previewHeight = previewWidth / targetRatio;
  const offsetY = (layout.height - previewHeight) / 2;
  return { x: 0, y: offsetY, width: previewWidth, height: previewHeight };
};

const clamp = (value: number, min: number, max: number) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const createStepStates = () => STEP_CONFIGS.map(() => ({ previewUri: null, uploaded: false }));

export default function TroubleCheckScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const { loading: detailsChecking } = useRequireProfileDetails();
  const cameraRef = useRef<CameraView>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [flowStage, setFlowStage] = useState<FlowStage>("capture");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepStates, setStepStates] = useState<StepState[]>(createStepStates());
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingStep, setUploadingStep] = useState<number | null>(null);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [cameraLayout, setCameraLayout] = useState<CameraLayout | null>(null);
  const [guideLayout, setGuideLayout] = useState<LayoutRectangle | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [analysisMessage, setAnalysisMessage] = useState("트러블 유형을 판별하는 중입니다...");
  const [reportData, setReportData] = useState<{
    summary: string;
    highlight: string;
    aiReport: AiReportContent | null;
  } | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

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

  const resolveUserId = useCallback(async () => {
    if (authUserId) return authUserId;
    const { data } = await supabase.auth.getUser();
    const id = data.user?.id ?? null;
    setAuthUserId(id);
    return id;
  }, [authUserId]);

  const prepareSession = useCallback(async () => {
    if (!SERVER_BASE_URL) {
      setSessionError("서버 주소가 설정되지 않았습니다.");
      return;
    }
    try {
      setCreatingSession(true);
      setSessionError(null);
      const userId = await resolveUserId();
      const response = await fetch(`${SERVER_BASE_URL}/api/analysis-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "trouble_check", status: "capturing", userId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.sessionId) {
        throw new Error(payload?.error ?? "세션 생성에 실패했습니다.");
      }
      sessionIdRef.current = payload.sessionId;
      setCompletedSessionId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "세션을 만들지 못했습니다.";
      setSessionError(message);
    } finally {
      setCreatingSession(false);
    }
  }, [resolveUserId]);

  useEffect(() => {
    prepareSession();
  }, [prepareSession]);

  const ensureSession = async () => {
    if (sessionIdRef.current) return true;
    await prepareSession();
    return !!sessionIdRef.current;
  };

  const updateSessionStatus = useCallback(async (status: "capturing" | "analyzing" | "report_ready") => {
    if (!sessionIdRef.current || !SERVER_BASE_URL) return;
    try {
      await fetch(`${SERVER_BASE_URL}/api/analysis-sessions/${sessionIdRef.current}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch (error) {
      console.warn("Trouble session status update failed", error);
    }
  }, []);

  const handleCameraLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCameraLayout((prev) => {
      if (prev && prev.width === width && prev.height === height) {
        return prev;
      }
      return { width, height };
    });
  }, []);

  const handleGuideLayout = useCallback((event: LayoutChangeEvent) => {
    const layout = event.nativeEvent.layout;
    setGuideLayout((prev) => {
      if (
        prev &&
        prev.x === layout.x &&
        prev.y === layout.y &&
        prev.width === layout.width &&
        prev.height === layout.height
      ) {
        return prev;
      }
      return layout;
    });
  }, []);

  const computeNormalizedRegion = useCallback(
    (photo?: { width?: number | null; height?: number | null }): NormalizedCropRegion | null => {
      if (!cameraLayout || cameraLayout.width <= 0 || cameraLayout.height <= 0 || !guideLayout) {
        return null;
      }
      const aspectRatio =
        photo?.width && photo?.height
          ? Math.abs((photo.width as number) / (photo.height as number))
          : CAMERA_ASPECT_RATIO;
      const previewRect = computePreviewRect(cameraLayout, aspectRatio);
      if (previewRect.width <= 0 || previewRect.height <= 0) {
        return null;
      }
      const left = Math.max(guideLayout.x, previewRect.x);
      const top = Math.max(guideLayout.y, previewRect.y);
      const right = Math.min(guideLayout.x + guideLayout.width, previewRect.x + previewRect.width);
      const bottom = Math.min(guideLayout.y + guideLayout.height, previewRect.y + previewRect.height);
      if (right <= left || bottom <= top) {
        return null;
      }
      const xRatio = (left - previewRect.x) / previewRect.width;
      const yRatio = (top - previewRect.y) / previewRect.height;
      const widthRatio = (right - left) / previewRect.width;
      const heightRatio = (bottom - top) / previewRect.height;

      const normalizedX = clamp(xRatio, 0, 1);
      const normalizedY = clamp(yRatio, 0, 1);
      const normalizedWidth = clamp(widthRatio, 0, 1 - normalizedX);
      const normalizedHeight = clamp(heightRatio, 0, 1 - normalizedY);

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
    [cameraLayout, guideLayout]
  );

  const fetchReportResult = useCallback(async () => {
    if (!sessionIdRef.current) {
      setReportError("세션 정보를 찾지 못했습니다.");
      return;
    }
    if (!SERVER_BASE_URL) {
      setReportError("서버 주소가 설정되지 않았습니다.");
      return;
    }
    setReportError(null);
    try {
      const response = await fetch(
        `${SERVER_BASE_URL}/api/trouble-analysis/${sessionIdRef.current}`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "트러블 분석을 불러오지 못했습니다.");
      }
      const aiPayload: AiReportContent | null = payload?.payload ?? null;
      setReportData({
        summary: aiPayload?.summary?.[0] ?? "",
        highlight: aiPayload?.oneLiner ?? "",
        aiReport: aiPayload,
      });
      setAnalysisMessage("AI 분석이 완료되었습니다.");
      setFlowStage("result");
      await updateSessionStatus("report_ready");
      setCompletedSessionId(sessionIdRef.current);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AI 리포트를 불러오지 못했습니다.";
      setReportError(message);
      setAnalysisMessage("리포트 연결에 실패했습니다. 다시 시도해 주세요.");
    }
  }, [updateSessionStatus]);

  const uploadTroublePhoto = async (uri: string, step: StepConfig) => {
    if (!UPLOAD_API_URL) {
      throw new Error("업로드 API 주소가 설정되지 않았습니다.");
    }
    if (!sessionIdRef.current) {
      throw new Error("세션 정보가 없어 업로드할 수 없습니다.");
    }
    const payload = new FormData();
    payload.append(
      "file",
      {
        uri,
        name: `${step.id}-${Date.now()}.jpg`,
        type: "image/jpeg",
      } as unknown as Blob
    );
    payload.append("shot_type", step.shotType);
    payload.append("focus_area", step.focusArea);
    payload.append("session_id", sessionIdRef.current);
    const userId = await resolveUserId();
    if (userId) {
      payload.append("user_id", userId);
    }

    const response = await fetch(UPLOAD_API_URL, { method: "POST", body: payload });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error ?? "업로드에 실패했습니다.");
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    if (uploadingStep !== null) return;
    if (!cameraLayout || !guideLayout) {
      setUploadError("가이드를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (!(await ensureSession())) {
      setUploadError("세션을 준비하지 못했습니다. 네트워크를 확인해주세요.");
      return;
    }
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });
      const region = computeNormalizedRegion(photo);
      if (!region) {
        setUploadError("촬영 영역을 찾지 못했습니다. 다시 촬영해 주세요.");
        return;
      }
      const processed = await optimizePhoto(photo, { crop: region });
      setStepStates((prev) => {
        const next = [...prev];
        next[currentStepIndex] = { previewUri: processed.uri, uploaded: false };
        return next;
      });
      setUploadingStep(currentStepIndex);
      setUploadError(null);
      let uploadSucceeded = false;
      try {
        await uploadTroublePhoto(processed.uri, STEP_CONFIGS[currentStepIndex]);
        uploadSucceeded = true;
        setStepStates((prev) => {
          const next = [...prev];
          next[currentStepIndex] = { ...next[currentStepIndex], uploaded: true };
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
      console.warn("trouble capture failed", error);
      setUploadError("촬영에 실패했습니다. 다시 시도해주세요.");
    }
  };

  const beginAnalysis = () => {
    setFlowStage("analyzing");
    setAnalysisMessage("AI가 트러블 유형을 세밀하게 정리하고 있어요...");
    updateSessionStatus("analyzing");
    fetchReportResult();
  };

  const handleReset = () => {
    setStepStates(createStepStates());
    setCurrentStepIndex(0);
    setFlowStage("capture");
    setUploadingStep(null);
    setUploadError(null);
    setAnalysisMessage("트러블 유형을 판별하는 중입니다...");
    setReportData(null);
    setReportError(null);
      // no-op
    setCompletedSessionId(null);
    sessionIdRef.current = null;
    prepareSession();
  };

  const handleOpenReport = () => {
    if (!completedSessionId) return;
    router.push({
      pathname: "/reports/[id]",
      params: { id: completedSessionId },
    });
  };

  const currentStep = STEP_CONFIGS[currentStepIndex] ?? STEP_CONFIGS[STEP_CONFIGS.length - 1];
  const readyToAnalyze = stepStates.every((state) => state.uploaded);
  const isUploading = uploadingStep !== null;

  const translateSeverity = (status?: string | null): "주의" | "보통" | "좋음" => {
    switch ((status ?? "").toLowerCase()) {
      case "caution":
        return "주의";
      case "good":
        return "좋음";
      default:
        return "보통";
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

  const aiContent = reportData?.aiReport ?? null;
  const summaryLines =
    aiContent?.summary?.length && aiContent.summary.some((line) => line?.trim())
      ? aiContent.summary
      : reportData?.summary
      ? [reportData.summary]
      : [];
  const findingsFromAi: FindingCard[] =
    aiContent?.keyFindings?.length && aiContent.keyFindings.some((item) => item?.title || item?.description)
      ? aiContent.keyFindings.map((entry, index) => ({
          id: entry.title || `finding-${index}`,
          label: entry.title || `분석 항목 ${index + 1}`,
          severity: translateSeverity(entry.status),
          description: entry.description ?? "",
        }))
      : [];
  const findingsToRender = findingsFromAi.length ? findingsFromAi : FALLBACK_FINDINGS;
  const careActions = aiContent?.actions?.length ? aiContent.actions : FALLBACK_ACTIONS;
  const severityStyle = (severity: string) => {
    if (severity === "주의") {
      return styles.severityDanger;
    }
    if (severity === "좋음") {
      return styles.severityNormal;
    }
    return styles.severityNeutral;
  };

  if (detailsChecking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <ActivityIndicator color="#A884CC" />
          <Text style={styles.centerText}>맞춤 정보를 확인하고 있어요...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>트러블 체크</Text>
        <Text style={styles.headerSubtitle}>트러블 부위를 두 번 촬영하면 더 정확해져요.</Text>
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

          <View style={styles.cameraWrapper} onLayout={handleCameraLayout}>
            {permission?.granted ? (
              <>
                <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
                <View pointerEvents="none" style={styles.guideLayer}>
                  <View style={styles.guideCircle} onLayout={handleGuideLayout} />
                  <Text style={styles.guideLabel}>{currentStep.guidance}</Text>
                </View>
              </>
            ) : (
              <View style={styles.cameraPermissionBlock}>
                <Text style={styles.permissionText}>카메라 권한을 허용해 주세요.</Text>
                <Pressable style={styles.permissionButton} onPress={requestPermission}>
                  <Text style={styles.permissionButtonText}>권한 허용</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.ghostButton, (currentStepIndex === 0 || isUploading) && styles.ghostButtonDisabled]}
              onPress={() => setCurrentStepIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentStepIndex === 0 || isUploading}
            >
              <Text
                style={[
                  styles.ghostButtonText,
                  (currentStepIndex === 0 || isUploading) && styles.ghostButtonTextDisabled,
                ]}
              >
                이전으로
              </Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, (isUploading || creatingSession) && styles.primaryButtonDisabled]}
              onPress={handleCapture}
              disabled={isUploading || creatingSession}
            >
              {isUploading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>촬영하기</Text>}
            </Pressable>
          </View>
          {(sessionError || uploadError) && <Text style={styles.errorText}>{sessionError ?? uploadError}</Text>}
        </View>
      )}

      {flowStage === "analyzing" && (
        <View style={styles.analyzingSection}>
          <ActivityIndicator size="large" color="#A884CC" />
          <Text style={styles.analyzingText}>{analysisMessage}</Text>
          {reportError && (
            <>
              <Text style={styles.errorText}>{reportError}</Text>
              <Pressable style={[styles.secondaryButton, { marginTop: 12 }]} onPress={fetchReportResult}>
                <Text style={styles.secondaryButtonText}>다시 시도하기</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {flowStage === "result" && (
        <ScrollView contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.resultTitle}>트러블 리포트</Text>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryEyebrow}>AI 한 줄 요약</Text>
            <Text style={styles.summaryHeadline}>
              {aiContent?.oneLiner ?? reportData?.highlight ?? "촬영한 사진을 기반으로 트러블을 요약했어요."}
            </Text>
            {summaryLines.map((line, index) => (
              <Text key={`${line}-${index}`} style={styles.summaryText}>
                • {line}
              </Text>
            ))}
            {aiContent?.focus?.reason && (
              <View style={styles.focusBadge}>
                <Text style={styles.focusBadgeLabel}>집중 케어</Text>
                <Text style={styles.focusBadgeText}>{aiContent.focus.reason}</Text>
              </View>
            )}
          </View>
          {findingsToRender.map((item) => (
            <View key={item.id} style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultLabel}>{item.label}</Text>
                <Text style={severityStyle(item.severity)}>{item.severity}</Text>
              </View>
              <Text style={styles.resultDescription}>{item.description}</Text>
              {item.tips?.length ? (
                <View style={styles.tipBlock}>
                  {item.tips.map((tip) => (
                    <Text key={tip} style={styles.tipText}>
                      • {tip}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
          {careActions.length > 0 && (
            <View style={styles.tipCard}>
              <Text style={styles.tipTitle}>관리법 제안</Text>
              {careActions.map((action, index) => (
                <View key={`${action.title}-${index}`} style={styles.actionItem}>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  <Text style={styles.actionDescription}>{action.description}</Text>
                  <Text style={styles.actionMeta}>{formatFrequency(action.frequency)}</Text>
                </View>
              ))}
            </View>
          )}
          {completedSessionId && (
            <Pressable style={styles.primaryFullButton} onPress={handleOpenReport}>
              <Text style={styles.primaryButtonText}>리포트에서 자세히 보기</Text>
            </Pressable>
          )}
          <Pressable style={styles.secondaryButton} onPress={handleReset}>
            <Text style={styles.secondaryButtonText}>다시 촬영하기</Text>
          </Pressable>
        </ScrollView>
      )}

      {flowStage === "capture" && readyToAnalyze && (
        <Pressable style={styles.analyzePrompt} onPress={beginAnalysis}>
          <Text style={styles.analyzePromptText}>촬영 완료 · AI 분석 시작</Text>
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
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  centerText: {
    fontSize: 14,
    color: "#6D6D74",
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
  guideLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  guideCircle: {
    width: GUIDE_WIDTH,
    height: GUIDE_HEIGHT,
    borderRadius: GUIDE_WIDTH / 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.7)",
    marginBottom: 12,
  },
  guideLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
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
    gap: 16,
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1F1F24",
  },
  summaryCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#EFE7FB",
    padding: 18,
    gap: 6,
  },
  summaryEyebrow: {
    fontSize: 13,
    color: "#A884CC",
    fontWeight: "600",
  },
  summaryHeadline: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F1F24",
  },
  summaryText: {
    fontSize: 13,
    color: "#4A4A55",
  },
  focusBadge: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: "#F6F3FB",
    padding: 10,
    gap: 4,
  },
  focusBadgeLabel: {
    fontSize: 12,
    color: "#A884CC",
    fontWeight: "600",
  },
  focusBadgeText: {
    fontSize: 13,
    color: "#4A4A55",
  },
  resultCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#EFE7FB",
    padding: 16,
    gap: 8,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultLabel: {
    fontSize: 16,
    color: "#1F1F24",
    fontWeight: "600",
  },
  severityDanger: {
    fontSize: 13,
    color: "#D93A5E",
  },
  severityNormal: {
    fontSize: 13,
    color: "#4CAF50",
  },
  severityNeutral: {
    fontSize: 13,
    color: "#8F8F99",
  },
  resultDescription: {
    fontSize: 13,
    color: "#4A4A55",
    lineHeight: 18,
  },
  tipBlock: {
    marginTop: 6,
    gap: 4,
  },
  tipText: {
    fontSize: 13,
    color: "#4A4A55",
  },
  actionItem: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8E0F5",
    gap: 4,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F1F24",
  },
  actionDescription: {
    fontSize: 13,
    color: "#4A4A55",
    lineHeight: 18,
  },
  actionMeta: {
    fontSize: 12,
    color: "#7A6F8D",
  },
  errorText: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 13,
    color: "#D6455D",
  },
  primaryFullButton: {
    marginTop: 10,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#A884CC",
  },
  secondaryButton: {
    marginTop: 12,
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
