import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useRequireProfileDetails } from "@/hooks/use-profile-details";
import { SERVER_BASE_URL } from "@/lib/server";
import {
  OX_CATEGORY_LABELS,
  OX_QUESTIONS,
  type OxAnswer,
  type OxQuestion,
} from "@/lib/ox-questions";

type RecordedAnswer = {
  answer: OxAnswer;
  updatedAt: string | null;
};

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  return `${parsed.getFullYear()}.${month}.${day}`;
};

export default function OxCheckScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const { userId, loading: profileLoading } = useRequireProfileDetails();

  const [records, setRecords] = useState<Record<string, RecordedAnswer>>({});
  const [selection, setSelection] = useState<OxAnswer>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const pendingQuestions = useMemo(
    () => OX_QUESTIONS.filter((question) => !records[question.key]),
    [records]
  );

  const currentQuestion: OxQuestion | null = useMemo(() => {
    if (activeKey) {
      return OX_QUESTIONS.find((question) => question.key === activeKey) ?? null;
    }
    return pendingQuestions[0] ?? null;
  }, [activeKey, pendingQuestions]);

  useEffect(() => {
    if (!currentQuestion) {
      setSelection(null);
      return;
    }
    const existing = records[currentQuestion.key]?.answer ?? null;
    setSelection(existing);
  }, [currentQuestion, records]);

  useEffect(() => {
    const fetchRecords = async () => {
      if (!userId) return;
      if (!SERVER_BASE_URL) {
        setError("SERVER_BASE_URL이 설정되지 않았습니다.");
        return;
      }
      setLoadingRecords(true);
      setError(null);
      try {
        const response = await fetch(
          `${SERVER_BASE_URL}/api/profile-ox?userId=${userId}`
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error ?? "OX 기록을 불러오지 못했습니다.");
        }
        const next: Record<string, RecordedAnswer> = {};
        (payload?.answers ?? []).forEach((entry: Record<string, unknown>) => {
          const key =
            typeof entry?.question_key === "string" ? entry.question_key : null;
          const answerRaw =
            typeof entry?.answer === "string"
              ? entry.answer.toUpperCase()
              : null;
          if (!key || (answerRaw !== "O" && answerRaw !== "X")) return;
          next[key] = {
            answer: answerRaw,
            updatedAt:
              typeof entry?.updated_at === "string" ? entry.updated_at : null,
          };
        });
        setRecords(next);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "OX 기록을 불러오지 못했습니다.";
        setError(message);
      } finally {
        setLoadingRecords(false);
      }
    };
    if (!profileLoading) {
      fetchRecords();
    }
  }, [profileLoading, userId]);

  const handleSubmit = async () => {
    if (!currentQuestion) {
      setError("진행할 질문이 없습니다.");
      return;
    }
    if (!userId) {
      setError("로그인 후 이용해 주세요.");
      return;
    }
    if (!selection) {
      setError("O 또는 X를 선택해 주세요.");
      return;
    }
    if (!SERVER_BASE_URL) {
      setError("SERVER_BASE_URL이 설정되지 않았습니다.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`${SERVER_BASE_URL}/api/profile-ox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          questionKey: currentQuestion.key,
          answer: selection,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "OX 응답을 저장하지 못했습니다.");
      }
      const updatedAt =
        typeof payload?.record?.updated_at === "string"
          ? payload.record.updated_at
          : new Date().toISOString();
      setRecords((prev) => ({
        ...prev,
        [currentQuestion.key]: { answer: selection, updatedAt },
      }));
      setActiveKey(null);
      setSelection(null);
      setSuccessMessage("생활 습관 기록을 반영했어요.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "OX 응답을 저장하지 못했습니다.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenHistory = () => {
    setHistoryOpen((prev) => !prev);
  };

  const handleEditRecord = (key: string) => {
    setActiveKey(key);
    setHistoryOpen(false);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  };

  const answeredEntries = useMemo(() => {
    return OX_QUESTIONS.filter((question) => records[question.key]).map(
      (question) => ({
        question,
        record: records[question.key]!,
      })
    );
  }, [records]);

  const allComplete = pendingQuestions.length === 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>생활 습관 OX 체크</Text>
        <Text style={styles.subtitle}>
          촬영과 별개로 생활 습관 데이터를 모아 두면 AI 리포트가 훨씬 정밀해져요.
        </Text>

        {profileLoading || loadingRecords ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#8B7CB7" />
            <Text style={styles.loadingText}>기록을 불러오는 중입니다...</Text>
          </View>
        ) : null}

        {!profileLoading && !userId ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>로그인이 필요해요</Text>
            <Text style={styles.noticeDescription}>
              생활 습관 기록은 계정에 저장되므로 로그인 후 이용해 주세요.
            </Text>
            <Pressable
              style={styles.noticeButton}
              onPress={() => router.push("/auth")}
            >
              <Text style={styles.noticeButtonText}>로그인/회원가입 이동</Text>
            </Pressable>
          </View>
        ) : null}

        {userId && currentQuestion ? (
          <View style={styles.questionCard}>
            <View style={styles.questionHeader}>
              <Text style={styles.questionCategory}>
                {OX_CATEGORY_LABELS[currentQuestion.category]}
              </Text>
              <Text style={styles.questionProgress}>
                {OX_QUESTIONS.length - pendingQuestions.length}/
                {OX_QUESTIONS.length}
              </Text>
            </View>
            <Text style={styles.questionTitle}>{currentQuestion.title}</Text>
            <Text style={styles.questionDescription}>
              {currentQuestion.description}
            </Text>
            <View style={styles.answerRow}>
              {(["O", "X"] as const).map((option) => {
                const selected = selection === option;
                return (
                  <Pressable
                    key={option}
                    style={[
                      styles.answerButton,
                      selected && styles.answerButtonSelected,
                    ]}
                    onPress={() => setSelection(option)}
                  >
                    <Text
                      style={[
                        styles.answerLabel,
                        selected && styles.answerLabelSelected,
                      ]}
                    >
                      {option}
                    </Text>
                    <Text style={styles.answerMeaning}>
                      {currentQuestion.options[option]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={[
                styles.submitButton,
                (!selection || submitting) && styles.buttonDisabled,
              ]}
              disabled={!selection || submitting}
              onPress={handleSubmit}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>
                  {records[currentQuestion.key] ? "답변 수정하기" : "기록 저장하기"}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {userId && allComplete ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>모든 질문을 완료했어요</Text>
            <Text style={styles.noticeDescription}>
              생활 패턴이 달라졌다면 언제든지 아래 기록에서 수정할 수 있어요.
            </Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {successMessage ? (
          <Text style={styles.successText}>{successMessage}</Text>
        ) : null}

        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>이전 기록 보기</Text>
          <Pressable style={styles.historyToggle} onPress={handleOpenHistory}>
            <Text style={styles.historyToggleText}>
              {historyOpen ? "접기" : "열기"}
            </Text>
          </Pressable>
        </View>
        {historyOpen ? (
          answeredEntries.length ? (
            answeredEntries.map(({ question, record }) => (
              <View key={question.key} style={styles.historyCard}>
                <View style={styles.historyCardHeader}>
                  <Text style={styles.historyCategory}>
                    {OX_CATEGORY_LABELS[question.category]}
                  </Text>
                  <Text style={styles.historyDate}>
                    {formatDate(record.updatedAt) ?? "방금 업데이트"}
                  </Text>
                </View>
                <Text style={styles.historyQuestion}>{question.title}</Text>
                <Text style={styles.historyAnswer}>
                  {record.answer === "O"
                    ? question.options.O
                    : question.options.X}
                </Text>
                <Pressable
                  style={styles.historyEditButton}
                  onPress={() => handleEditRecord(question.key)}
                >
                  <Text style={styles.historyEditText}>수정하기</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <View style={styles.historyEmpty}>
              <Text style={styles.historyEmptyText}>
                아직 저장된 생활 습관 기록이 없어요.
              </Text>
            </View>
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  container: {
    padding: 20,
    paddingBottom: 48,
    gap: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F1F24",
  },
  subtitle: {
    fontSize: 14,
    color: "#6F6F73",
    lineHeight: 20,
  },
  loadingCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#F5F1FF",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#6F6F73",
  },
  noticeCard: {
    borderRadius: 16,
    backgroundColor: "#F9F5FF",
    padding: 20,
    gap: 10,
  },
  noticeTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#3C2964",
  },
  noticeDescription: {
    fontSize: 14,
    color: "#6F6F73",
    lineHeight: 20,
  },
  noticeButton: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: "#8B7CB7",
    paddingVertical: 12,
    alignItems: "center",
  },
  noticeButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  questionCard: {
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    padding: 20,
    gap: 12,
    shadowColor: "#1F1F24",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  questionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  questionCategory: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8B7CB7",
    backgroundColor: "#F2EDFF",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  questionProgress: {
    fontSize: 13,
    color: "#6F6F73",
  },
  questionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F1F24",
    lineHeight: 28,
  },
  questionDescription: {
    fontSize: 14,
    color: "#6F6F73",
    lineHeight: 22,
  },
  answerRow: {
    flexDirection: "column",
    gap: 12,
  },
  answerButton: {
    borderWidth: 1,
    borderColor: "#E1E1E5",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  answerButtonSelected: {
    borderColor: "#8B7CB7",
    backgroundColor: "#F4F1FF",
  },
  answerLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#3C2964",
  },
  answerLabelSelected: {
    color: "#8B7CB7",
  },
  answerMeaning: {
    fontSize: 14,
    color: "#4F4F54",
    lineHeight: 20,
  },
  submitButton: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#8B7CB7",
    marginTop: 8,
  },
  submitText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    backgroundColor: "#D5CFF0",
  },
  errorText: {
    color: "#D64545",
    fontSize: 13,
  },
  successText: {
    color: "#2F8F3A",
    fontSize: 13,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F1F24",
  },
  historyToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F2EDFF",
  },
  historyToggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6F58A8",
  },
  historyCard: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#F0EFF5",
  },
  historyCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyCategory: {
    fontSize: 12,
    color: "#8B7CB7",
    fontWeight: "600",
  },
  historyDate: {
    fontSize: 12,
    color: "#9C9CA3",
  },
  historyQuestion: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F1F24",
  },
  historyAnswer: {
    fontSize: 14,
    color: "#4F4F54",
    lineHeight: 20,
  },
  historyEditButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E1E1E5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4,
  },
  historyEditText: {
    fontSize: 12,
    color: "#6F58A8",
    fontWeight: "600",
  },
  historyEmpty: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: "#F9F7FF",
    padding: 16,
  },
  historyEmptyText: {
    fontSize: 14,
    color: "#6F6F73",
  },
});
