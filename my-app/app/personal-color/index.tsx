import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { useRouter } from "expo-router";

import { optimizePhoto } from "@/lib/photo-utils";
import {
  computePersonalColorResult,
  type PersonalColorInputs,
  type PersonalColorResult,
} from "@/lib/personal-color";
import { SERVER_BASE_URL } from "@/lib/server";
import { useRequireProfileDetails } from "@/hooks/use-profile-details";

type FaceDetectorModule = typeof import("expo-face-detector");
let NativeFaceDetector: FaceDetectorModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  NativeFaceDetector = require("expo-face-detector");
} catch {
  NativeFaceDetector = null;
}

type FlowStage = "intro" | "camera" | "select" | "result";

type CapturedPhoto = {
  uri: string;
  width?: number;
  height?: number;
};

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; reportId: string }
  | { status: "error"; error: string };

type ToneTint = {
  cheekColor: string;
  lipColor: string;
  cheekOpacity?: number;
  lipOpacity?: number;
};

type DetectorPoint = import("expo-face-detector").Point;

type NormalizedPoint = { x: number; y: number };

type MouthBox = {
  left: NormalizedPoint;
  right: NormalizedPoint;
  top: NormalizedPoint;
  bottom: NormalizedPoint;
};

type OverlayLandmarks = {
  leftCheek?: NormalizedPoint;
  rightCheek?: NormalizedPoint;
  mouth?: MouthBox;
};

type ToneOption = {
  id: string;
  toneLabel: string;
  shortLabel: string;
  description: string;
  tint: ToneTint;
  inputs: PersonalColorInputs;
  tags: string[];
};

const defaultGuideTint: ToneTint = {
  cheekColor: "rgba(242, 194, 208, 0.35)",
  lipColor: "rgba(229, 146, 168, 0.4)",
};

const fallbackOverlay: OverlayLandmarks = {
  leftCheek: { x: 0.25, y: 0.43 },
  rightCheek: { x: 0.75, y: 0.43 },
  mouth: {
    left: { x: 0.35, y: 0.67 },
    right: { x: 0.65, y: 0.67 },
    top: { x: 0.5, y: 0.6 },
    bottom: { x: 0.5, y: 0.8 },
  },
};

const TONE_OPTIONS: ToneOption[] = [
  {
    id: "warm-light",
    toneLabel: "봄 웜 라이트",
    shortLabel: "Warm Light",
    description: "살구빛이 잘 어울리고 얼굴이 밝아 보일 때",
    tint: {
      cheekColor: "#FFD4C2",
      cheekOpacity: 0.45,
      lipColor: "#FF9E91",
      lipOpacity: 0.55,
    },
    inputs: { tone: 0.85, depth: 0.28, clarity: 0.62 },
    tags: ["Warm", "Light"],
  },
  {
    id: "warm-true",
    toneLabel: "봄 웜 브라이트",
    shortLabel: "Warm Glow",
    description: "코랄·피치가 생기를 주는 느낌",
    tint: {
      cheekColor: "#FFC09E",
      cheekOpacity: 0.48,
      lipColor: "#FF6E7E",
      lipOpacity: 0.55,
    },
    inputs: { tone: 0.82, depth: 0.45, clarity: 0.7 },
    tags: ["Warm", "Vivid"],
  },
  {
    id: "warm-deep",
    toneLabel: "가을 웜 소프트",
    shortLabel: "Warm Deep",
    description: "골드·브라운이 얼굴을 안정시킬 때",
    tint: {
      cheekColor: "#E7A07F",
      cheekOpacity: 0.5,
      lipColor: "#C1563B",
      lipOpacity: 0.45,
    },
    inputs: { tone: 0.78, depth: 0.72, clarity: 0.45 },
    tags: ["Warm", "Deep"],
  },
  {
    id: "neutral-light",
    toneLabel: "뉴트럴 라이트",
    shortLabel: "Neutral Airy",
    description: "웜·쿨 모두 옅게 바르면 자연스러울 때",
    tint: {
      cheekColor: "#F2D9E4",
      cheekOpacity: 0.45,
      lipColor: "#F3A2C4",
      lipOpacity: 0.5,
    },
    inputs: { tone: 0.55, depth: 0.3, clarity: 0.5 },
    tags: ["Neutral", "Soft"],
  },
  {
    id: "neutral-true",
    toneLabel: "뉴트럴 클래식",
    shortLabel: "Neutral True",
    description: "톤 차이를 크게 두지 않아도 안정적인 경우",
    tint: {
      cheekColor: "#E3C9F2",
      cheekOpacity: 0.48,
      lipColor: "#DE8CC2",
      lipOpacity: 0.5,
    },
    inputs: { tone: 0.5, depth: 0.5, clarity: 0.55 },
    tags: ["Neutral", "Balanced"],
  },
  {
    id: "neutral-deep",
    toneLabel: "뉴트럴 딥",
    shortLabel: "Neutral Deep",
    description: "톤다운 컬러로 윤곽을 잡아야 할 때",
    tint: {
      cheekColor: "#C6A5D8",
      cheekOpacity: 0.48,
      lipColor: "#AF6BA5",
      lipOpacity: 0.48,
    },
    inputs: { tone: 0.48, depth: 0.72, clarity: 0.48 },
    tags: ["Neutral", "Deep"],
  },
  {
    id: "cool-light",
    toneLabel: "여름 쿨 라이트",
    shortLabel: "Cool Light",
    description: "라일락·장밋빛이 얼굴을 맑게 만드는 경우",
    tint: {
      cheekColor: "#D7CDFF",
      cheekOpacity: 0.45,
      lipColor: "#EE8BD4",
      lipOpacity: 0.5,
    },
    inputs: { tone: 0.28, depth: 0.32, clarity: 0.58 },
    tags: ["Cool", "Light"],
  },
  {
    id: "cool-true",
    toneLabel: "겨울 쿨 트루",
    shortLabel: "Cool True",
    description: "선명한 핑크나 레드가 또렷할 때",
    tint: {
      cheekColor: "#C9C1FF",
      cheekOpacity: 0.5,
      lipColor: "#D35CBF",
      lipOpacity: 0.55,
    },
    inputs: { tone: 0.2, depth: 0.52, clarity: 0.7 },
    tags: ["Cool", "Vivid"],
  },
  {
    id: "cool-deep",
    toneLabel: "겨울 쿨 딥",
    shortLabel: "Cool Deep",
    description: "버건디·플럼 톤이 얼굴에 힘을 줄 때",
    tint: {
      cheekColor: "#9E94E6",
      cheekOpacity: 0.5,
      lipColor: "#9B3D8B",
      lipOpacity: 0.5,
    },
    inputs: { tone: 0.18, depth: 0.78, clarity: 0.6 },
    tags: ["Cool", "Deep"],
  },
];

export default function PersonalColorSelectorScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { loading: detailsChecking } = useRequireProfileDetails();

  const [stage, setStage] = useState<FlowStage>("intro");
  const [capturing, setCapturing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<CapturedPhoto | null>(null);
  const [selectedToneId, setSelectedToneId] = useState<string | null>(null);
  const [lockedToneId, setLockedToneId] = useState<string | null>(null);
  const [result, setResult] = useState<PersonalColorResult | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [overlayLandmarks, setOverlayLandmarks] = useState<OverlayLandmarks | null>(null);

  const selectedTone = selectedToneId
    ? TONE_OPTIONS.find((option) => option.id === selectedToneId) ?? null
    : null;
  const lockedTone = lockedToneId
    ? TONE_OPTIONS.find((option) => option.id === lockedToneId) ?? null
    : null;

  useEffect(() => {
    if (permission?.granted) {
      return;
    }
    requestPermission();
  }, [permission, requestPermission]);

  const detectOverlayPoints = async (photo: CapturedPhoto) => {
    if (!photo?.uri || !photo.width || !photo.height) {
      return null;
    }
    if (!NativeFaceDetector?.detectFacesAsync) {
      return null;
    }
    try {
      const detection = await NativeFaceDetector.detectFacesAsync(photo.uri, {
        mode: NativeFaceDetector.FaceDetectorMode.fast,
        detectLandmarks: NativeFaceDetector.FaceDetectorLandmarks.all,
        runClassifications: NativeFaceDetector.FaceDetectorClassifications.none,
      });
      const face = detection.faces?.[0];
      if (!face) {
        return null;
      }
      const clamp = (value: number) => Math.min(Math.max(value, 0), 1);
      const normalize = (point?: DetectorPoint | null) => {
        if (!point) return null;
        return {
          x: clamp(point.x / photo.width),
          y: clamp(point.y / photo.height),
        };
      };

      const leftCheek = normalize(face.leftCheekPosition);
      const rightCheek = normalize(face.rightCheekPosition);
      const mouthLeft = normalize(face.leftMouthPosition);
      const mouthRight = normalize(face.rightMouthPosition);
      const mouthTop = normalize(face.mouthPosition ?? face.noseBasePosition);
      const mouthBottom = normalize(face.bottomMouthPosition ?? face.mouthPosition);

      const overlay: OverlayLandmarks = {};
      if (leftCheek) {
        overlay.leftCheek = leftCheek;
      }
      if (rightCheek) {
        overlay.rightCheek = rightCheek;
      }
      if (mouthLeft && mouthRight && mouthTop && mouthBottom) {
        overlay.mouth = {
          left: mouthLeft,
          right: mouthRight,
          top: mouthTop,
          bottom: mouthBottom,
        };
      }
      return Object.keys(overlay).length ? overlay : null;
    } catch (err) {
      console.warn("Failed to detect face landmarks", err);
      return null;
    }
  };

  const handleStart = async () => {
    if (permission?.granted) {
      setStage("camera");
      return;
    }
    const status = await requestPermission();
    if (status.granted) {
      setStage("camera");
    } else {
      setError("카메라 접근 권한이 필요합니다.");
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    setError(null);
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: true,
      });
      const optimized = await optimizePhoto(photo);
      setCapturedPhoto(optimized);
      setOverlayLandmarks(null);
      setStage("select");
      detectOverlayPoints(optimized)
        .then((landmarks) => {
          setOverlayLandmarks(landmarks);
        })
        .catch(() => {
          setOverlayLandmarks(null);
        });
      setSelectedToneId(null);
      setLockedToneId(null);
      setResult(null);
      setSaveState({ status: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "촬영에 실패했습니다. 다시 시도해주세요.";
      setError(message);
    } finally {
      setCapturing(false);
    }
  };

  const handleRetake = () => {
    setStage("camera");
    setCapturedPhoto(null);
    setSelectedToneId(null);
    setLockedToneId(null);
    setResult(null);
    setSaveState({ status: "idle" });
    setOverlayLandmarks(null);
  };

  const handleRestart = () => {
    setStage("intro");
    setCapturedPhoto(null);
    setSelectedToneId(null);
    setLockedToneId(null);
    setResult(null);
    setSaveState({ status: "idle" });
    setError(null);
    setOverlayLandmarks(null);
  };

  const handleConfirmTone = () => {
    if (!selectedTone) return;
    const computed = computePersonalColorResult(selectedTone.inputs);
    setLockedToneId(selectedTone.id);
    setResult(computed);
    setStage("result");
    setSaveState({ status: "idle" });
  };

  const handleSaveReport = async () => {
    if (!capturedPhoto || !result || !lockedTone) return;
    if (!SERVER_BASE_URL) {
      setSaveState({ status: "error", error: "서버 주소가 설정되지 않았습니다." });
      return;
    }
    try {
      setSaveState({ status: "saving" });
      const formData = new FormData();
      formData.append(
        "file",
        {
          uri: capturedPhoto.uri,
          name: `personal-${Date.now()}.jpg`,
          type: "image/jpeg",
        } as unknown as Blob
      );
      formData.append("payload", JSON.stringify(result));
      formData.append("inputs", JSON.stringify(lockedTone.inputs));
      formData.append("session_label", result.sessionLabel);

      const response = await fetch(`${SERVER_BASE_URL}/api/personal-color`, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "저장에 실패했습니다.");
      }
      setSaveState({ status: "saved", reportId: payload.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "리포트를 저장하지 못했습니다.";
      setSaveState({ status: "error", error: message });
    }
  };

  const handleSeeReport = () => {
    if (saveState.status !== "saved") return;
    router.push({
      pathname: "/reports/[id]",
      params: {
        id: saveState.reportId,
        type: "personal_color",
      },
    });
  };

  const renderIntro = () => (
    <View style={styles.introWrapper}>
      <Text style={styles.screenTitle}>퍼스널컬러 측정</Text>
      <Text style={styles.screenSubtitle}>
        사진 한 장으로 9가지 컬러 룩을 입혀볼게요. 가장 잘 어울리는 조합만 선택해 주세요.
      </Text>
      <View style={styles.introCard}>
        <Text style={styles.introHeadline}>진행 순서</Text>
        <Text style={styles.introText}>1. 카메라로 얼굴 전체를 촬영</Text>
        <Text style={styles.introText}>2. 3×3 컬러 후보에서 가장 자연스러운 이미지를 선택</Text>
        <Text style={styles.introText}>3. 결과 확인 후 리포트에 저장</Text>
      </View>
      <Pressable style={styles.primaryButton} onPress={handleStart}>
        <Text style={styles.primaryButtonText}>측정 시작하기</Text>
      </Pressable>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );

  const renderCamera = () => (
    <View style={styles.cameraWrapper}>
      <View style={styles.cameraPreviewBox}>
        <CameraView style={StyleSheet.absoluteFill} ref={cameraRef} facing="front" />
        <GuideOverlay tint={defaultGuideTint} landmarks={null} />
        <View style={styles.cameraOverlay}>
          <Text style={styles.overlayTitle}>얼굴 전체를 프레임 안으로 맞춰주세요</Text>
          <Text style={styles.overlayText}>입술과 볼이 중앙 가이드 안에 들어오면 더 정확해요.</Text>
        </View>
      </View>
      <Pressable style={styles.captureButton} onPress={handleCapture} disabled={capturing}>
        {capturing ? <ActivityIndicator color="#A884CC" /> : <Text style={styles.captureLabel}>촬영</Text>}
      </Pressable>
      <Pressable style={styles.closeButton} onPress={handleRestart}>
        <Text style={styles.closeText}>닫기</Text>
      </Pressable>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );

  const renderToneSelection = () => {
    if (!capturedPhoto) return null;
    return (
      <ScrollView style={styles.selectionWrapper} contentContainerStyle={styles.selectionContent}>
        <View style={styles.headerRow}>
          <Pressable onPress={handleRetake}>
            <Text style={styles.secondaryText}>다시 촬영</Text>
          </Pressable>
          <Text style={styles.stepTitle}>퍼스널컬러 선택</Text>
          <Pressable onPress={handleRestart}>
            <Text style={styles.secondaryText}>종료</Text>
          </Pressable>
        </View>
        <Text style={styles.stepIndicator}>9가지 룩 중 가장 자연스럽다고 느껴지는 카드를 골라주세요.</Text>
        <View style={styles.toneGrid}>
          {TONE_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={[
                styles.toneCard,
                selectedToneId === option.id && styles.toneCardSelected,
              ]}
              onPress={() => {
                setSelectedToneId(option.id);
                setError(null);
              }}
            >
              <View style={styles.toneImageWrapper}>
                <Image source={capturedPhoto.uri} style={styles.toneImage} contentFit="cover" />
                <GuideOverlay tint={option.tint} landmarks={overlayLandmarks} />
              </View>
              <Text style={styles.toneLabel}>{option.toneLabel}</Text>
              <Text style={styles.toneTag}>{option.tags.join(" · ")}</Text>
              <Text style={styles.toneDescription}>{option.description}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={[styles.primaryButton, !selectedTone && styles.primaryButtonDisabled]}
          onPress={handleConfirmTone}
          disabled={!selectedTone}
        >
          <Text style={styles.primaryButtonText}>이 조합으로 결정</Text>
        </Pressable>
        {error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>
    );
  };

  const renderResult = () => {
    if (!result || !capturedPhoto) return null;
    return (
      <ScrollView style={styles.resultWrapper} contentContainerStyle={styles.resultContent}>
        <View style={styles.headerRow}>
          <Pressable onPress={handleRetake}>
            <Text style={styles.secondaryText}>다시 촬영</Text>
          </Pressable>
          <Text style={styles.stepTitle}>측정 결과</Text>
          <Pressable onPress={handleRestart}>
            <Text style={styles.secondaryText}>홈</Text>
          </Pressable>
        </View>
        <View style={styles.resultPreview}>
          <Image source={capturedPhoto.uri} style={styles.resultImage} contentFit="cover" />
          {lockedTone && <GuideOverlay tint={lockedTone.tint} landmarks={overlayLandmarks} />}
        </View>
        <Text style={styles.resultTone}>{lockedTone?.toneLabel ?? result.extras.toneLabel}</Text>
        <Text style={styles.resultHeadline}>{result.highlight}</Text>
        <Text style={styles.resultSummary}>{result.summary}</Text>

        <View style={styles.paletteRow}>
          {result.extras.palette.map((color) => (
            <View key={color} style={[styles.paletteChip, { backgroundColor: color }]} />
          ))}
        </View>

        <View style={styles.storyCard}>
          {result.extras.storyline.map((line) => (
            <Text key={line} style={styles.storyText}>
              {line}
            </Text>
          ))}
        </View>

        <Pressable
          style={[styles.primaryButton, saveState.status === "saving" && styles.primaryButtonDisabled]}
          onPress={handleSaveReport}
          disabled={saveState.status === "saving"}
        >
          {saveState.status === "saving" ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>리포트 저장하기</Text>
          )}
        </Pressable>

        {saveState.status === "saved" && (
          <View style={styles.successCard}>
            <Text style={styles.successText}>저장 완료! 리포트 메뉴에서 확인할 수 있어요.</Text>
            <Pressable style={styles.secondaryButton} onPress={handleSeeReport}>
              <Text style={styles.secondaryButtonText}>아카이브에서 보기</Text>
            </Pressable>
          </View>
        )}
        {saveState.status === "error" && <Text style={styles.errorText}>{saveState.error}</Text>}
      </ScrollView>
    );
  };

  if (detailsChecking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <ActivityIndicator color="#A884CC" />
          <Text style={styles.centerText}>맞춤 정보를 불러오는 중입니다...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {stage === "intro" && renderIntro()}
      {stage === "camera" && renderCamera()}
      {stage === "select" && renderToneSelection()}
      {stage === "result" && renderResult()}
    </SafeAreaView>
  );
}

const GuideOverlay = ({
  tint = defaultGuideTint,
  landmarks,
}: {
  tint?: ToneTint;
  landmarks?: OverlayLandmarks | null;
}) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const resolved = landmarks && (landmarks.leftCheek || landmarks.rightCheek || landmarks.mouth) ? landmarks : fallbackOverlay;
  const leftCheekPoint = resolved.leftCheek ?? fallbackOverlay.leftCheek!;
  const rightCheekPoint = resolved.rightCheek ?? fallbackOverlay.rightCheek!;
  const mouthBox = resolved.mouth ?? fallbackOverlay.mouth!;

  const cheekSpan = Math.abs(rightCheekPoint.x - leftCheekPoint.x);
  const cheekDiameter = Math.max(size.width * 0.22, cheekSpan * size.width * 0.6);

  const mouthWidth = Math.max(Math.abs(mouthBox.right.x - mouthBox.left.x) * size.width * 1.1, size.width * 0.35);
  const mouthHeight = Math.max(Math.abs(mouthBox.bottom.y - mouthBox.top.y) * size.height * 1.2, size.height * 0.12);
  const mouthCenterX = ((mouthBox.left.x + mouthBox.right.x) / 2) * size.width;
  const mouthCenterY = ((mouthBox.top.y + mouthBox.bottom.y) / 2) * size.height;

  return (
    <View
      style={styles.overlayContainer}
      pointerEvents="none"
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        if (width !== size.width || height !== size.height) {
          setSize({ width, height });
        }
      }}
    >
      {size.width > 0 && size.height > 0 && (
        <>
          <View
            style={[
              styles.overlayCircle,
              {
                width: cheekDiameter,
                height: cheekDiameter,
                left: leftCheekPoint.x * size.width - cheekDiameter / 2,
                top: leftCheekPoint.y * size.height - cheekDiameter / 2,
                backgroundColor: tint.cheekColor,
                opacity: tint.cheekOpacity ?? 0.35,
              },
            ]}
          />
          <View
            style={[
              styles.overlayCircle,
              {
                width: cheekDiameter,
                height: cheekDiameter,
                left: rightCheekPoint.x * size.width - cheekDiameter / 2,
                top: rightCheekPoint.y * size.height - cheekDiameter / 2,
                backgroundColor: tint.cheekColor,
                opacity: tint.cheekOpacity ?? 0.35,
              },
            ]}
          />
          <View
            style={[
              styles.overlayLip,
              {
                width: mouthWidth,
                height: mouthHeight,
                left: mouthCenterX - mouthWidth / 2,
                top: mouthCenterY - mouthHeight / 2,
                borderRadius: mouthHeight,
                backgroundColor: tint.lipColor,
                opacity: tint.lipOpacity ?? 0.4,
              },
            ]}
          />
        </>
      )}
    </View>
  );
};

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
    color: "#6F6F73",
  },
  introWrapper: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1F1F24",
  },
  screenSubtitle: {
    fontSize: 16,
    color: "#4A4A55",
    marginTop: 8,
    marginBottom: 24,
  },
  introCard: {
    padding: 20,
    borderRadius: 18,
    backgroundColor: "#F6F1FC",
    marginBottom: 32,
  },
  introHeadline: {
    fontSize: 18,
    fontWeight: "600",
    color: "#3A2F4F",
    marginBottom: 12,
  },
  introText: {
    fontSize: 15,
    color: "#4F4A63",
    marginBottom: 6,
  },
  primaryButton: {
    backgroundColor: "#A884CC",
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  errorText: {
    color: "#D93A5E",
    textAlign: "center",
    marginTop: 12,
  },
  cameraWrapper: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 32,
  },
  cameraPreviewBox: {
    width: "100%",
    flex: 1,
    alignSelf: "stretch",
  },
  cameraOverlay: {
    position: "absolute",
    top: 80,
    left: 16,
    right: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  overlayTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  overlayText: {
    color: "#D7D7E0",
    marginTop: 6,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    marginBottom: 12,
  },
  captureLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  closeButton: {
    position: "absolute",
    top: 24,
    right: 24,
    padding: 8,
  },
  closeText: {
    color: "#FFFFFF",
    fontSize: 16,
  },
  selectionWrapper: {
    flex: 1,
    paddingHorizontal: 20,
  },
  selectionContent: {
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  secondaryText: {
    color: "#6F6F73",
    fontSize: 14,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1F1F24",
  },
  stepIndicator: {
    textAlign: "center",
    color: "#6F6F73",
    marginBottom: 16,
  },
  toneGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  toneCard: {
    width: "32%",
    borderRadius: 16,
    backgroundColor: "#F7F4FB",
    padding: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 14,
  },
  toneCardSelected: {
    borderColor: "#A884CC",
    backgroundColor: "#F1E6FF",
  },
  toneImageWrapper: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
    position: "relative",
  },
  toneImage: {
    width: "100%",
    height: "100%",
  },
  toneLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1F1F24",
    textAlign: "center",
  },
  toneTag: {
    fontSize: 11,
    color: "#8C709B",
    marginTop: 2,
  },
  toneDescription: {
    fontSize: 11,
    color: "#6F6F73",
    textAlign: "center",
    marginTop: 4,
  },
  resultWrapper: {
    flex: 1,
    paddingHorizontal: 20,
  },
  resultContent: {
    paddingBottom: 40,
  },
  resultPreview: {
    borderRadius: 24,
    overflow: "hidden",
    aspectRatio: 9 / 16,
    marginTop: 12,
    position: "relative",
  },
  resultImage: {
    width: "100%",
    height: "100%",
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  overlayCircle: {
    position: "absolute",
    width: "38%",
    aspectRatio: 1,
    borderRadius: 999,
  },
  overlayLip: {
    position: "absolute",
    width: "45%",
    height: "13%",
    borderRadius: 999,
    bottom: "20%",
  },
  resultTone: {
    fontSize: 22,
    fontWeight: "700",
    color: "#A884CC",
    textAlign: "center",
    marginTop: 20,
  },
  resultHeadline: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
    color: "#1F1F24",
  },
  resultSummary: {
    fontSize: 15,
    color: "#4A4A55",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  paletteRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  paletteChip: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    marginHorizontal: 4,
  },
  storyCard: {
    backgroundColor: "#F6F1FC",
    borderRadius: 18,
    padding: 16,
    marginTop: 20,
  },
  storyText: {
    color: "#4A4A55",
    marginBottom: 6,
  },
  successCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#F0FBF5",
    alignItems: "center",
    gap: 8,
  },
  successText: {
    color: "#2E7D5B",
    fontWeight: "600",
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D5C7EB",
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    color: "#6F6F73",
    fontSize: 15,
    fontWeight: "500",
  },
});
