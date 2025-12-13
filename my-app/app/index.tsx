import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { randomUUID } from "expo-crypto";
import { SafeAreaView } from "react-native-safe-area-context";

type CaptureState = "idle" | "uploading" | "success" | "error";

const UPLOAD_API_URL = process.env.EXPO_PUBLIC_UPLOAD_API_URL ?? "";

export default function SkinDiagnosisScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [flashVisible, setFlashVisible] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);

  const ensurePermission = async () => {
    if (permission?.granted) {
      return true;
    }

    const response = await requestPermission();
    return response.granted;
  };

  const handleStartDiagnosis = async () => {
    const granted = await ensurePermission();
    if (!granted) {
      setStatusMessage("카메라 권한이 허용되어야 촬영할 수 있습니다.");
      return;
    }

    setIsCameraOpen(true);
    setStatusMessage("얼굴을 화면 중앙에 맞추고 촬영 버튼을 눌러주세요.");
  };

  const closeCamera = () => {
    setIsCameraOpen(false);
    setFlashVisible(false);
    setStatusMessage("");
  };

  const handleRetake = () => {
    setPreviewUri(null);
    setCaptureState("idle");
    setStatusMessage("얼굴을 다시 촬영해주세요.");
  };

  const uploadViaApi = async (uri: string) => {
    if (!UPLOAD_API_URL) {
      throw new Error("EXPO_PUBLIC_UPLOAD_API_URL 값을 설정해주세요.");
    }

    const fileName = `ai-skin-${Date.now()}-${randomUUID()}.jpg`;
    const formData = new FormData();
    formData.append("file", {
      uri,
      name: fileName,
      type: "image/jpeg",
    } as any);

    const response = await fetch(UPLOAD_API_URL, {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error || "서버 업로드 실패");
    }

    return result;
  };

  const triggerFlash = () => {
    setFlashVisible(true);
    setTimeout(() => setFlashVisible(false), 150);
  };

  const handleCapture = async () => {
    if (!cameraRef.current) {
      return;
    }

    try {
      triggerFlash();
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: true,
      });

      setPreviewUri(photo.uri);
      setCaptureState("uploading");
      setStatusMessage("촬영한 이미지를 Supabase로 전송 중입니다...");

      const result = await uploadViaApi(photo.uri);
      const publicUrl = result?.publicUrl ?? result?.photo?.image_url ?? "";
      setUploadUrl(publicUrl || null);

      setCaptureState("success");
      setStatusMessage("전송 완료! 피부 점수 계산을 준비 중입니다.");
    } catch (error) {
      setCaptureState("error");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "촬영 또는 업로드 중 문제가 발생했습니다."
      );
      setFlashVisible(false);
    }
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
        {flashVisible && <View style={styles.flashOverlay} pointerEvents="none" />}

        <View style={styles.cameraControls}>
          <Pressable
            style={({ pressed }) => [
              styles.shutterButton,
              pressed && styles.shutterPressed,
              captureState === "uploading" && styles.buttonDisabled,
            ]}
            onPress={handleCapture}
            disabled={captureState === "uploading"}
          >
            <Text style={styles.shutterLabel}>촬영</Text>
          </Pressable>

          <Pressable style={styles.closeButton} onPress={closeCamera}>
            <Text style={styles.closeButtonText}>닫기</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.heroCard}>
          <Text style={styles.bannerTitle}>AI 피부 진단</Text>
          <Text style={styles.bannerDescription}>
            전면 카메라로 피부를 촬영하고 Supabase에 업로드해 분석을 준비합니다.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.ctaButton,
              pressed && styles.ctaButtonPressed,
            ]}
            onPress={handleStartDiagnosis}
          >
            <Text style={styles.ctaLabel}>
              {isCameraOpen ? "다시 촬영하기" : "AI 피부 진단 시작"}
            </Text>
          </Pressable>
        </View>

        {isCameraOpen && renderCamera()}

        {previewUri && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>미리보기</Text>
            <Image source={{ uri: previewUri }} style={styles.previewImage} />
            {uploadUrl && (
              <Text style={styles.previewUrl} numberOfLines={1}>
                {uploadUrl}
              </Text>
            )}
            <View style={styles.previewActions}>
              <Pressable style={styles.secondaryButton} onPress={handleRetake}>
                <Text style={styles.secondaryButtonText}>다시 촬영</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={closeCamera}>
                <Text style={styles.secondaryButtonText}>카메라 닫기</Text>
              </Pressable>
            </View>
          </View>
        )}

        {!!statusMessage && (
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>{statusMessage}</Text>
            {captureState === "uploading" && <ActivityIndicator color="#A884CC" />}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F6F1FA",
  },
  container: {
    flex: 1,
    padding: 20,
    gap: 20,
  },
  heroCard: {
    backgroundColor: "#1f1b2e",
    borderRadius: 24,
    padding: 20,
  },
  bannerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    marginBottom: 8,
  },
  bannerDescription: {
    color: "white",
    opacity: 0.8,
    marginBottom: 16,
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
  cameraWrapper: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
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
  },
  shutterButton: {
    backgroundColor: "#FFFFFF",
    width: 120,
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
  buttonDisabled: {
    opacity: 0.5,
  },
  closeButton: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 999,
  },
  closeButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  previewCard: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  previewTitle: {
    fontWeight: "bold",
    fontSize: 16,
  },
  previewImage: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: "#000",
  },
  previewUrl: {
    color: "#6A4BA1",
    fontSize: 12,
  },
  previewActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#A884CC",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#A884CC",
    fontWeight: "600",
  },
  statusCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "white",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  statusText: {
    flex: 1,
    color: "#4B3A63",
  },
  permissionCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DDD",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "white",
  },
  permissionText: {
    textAlign: "center",
    color: "#4B3A63",
    marginBottom: 16,
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
