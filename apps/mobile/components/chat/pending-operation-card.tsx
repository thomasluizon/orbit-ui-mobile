import { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { ShieldAlert } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { AgentExecuteOperationResponse, PendingAgentOperation } from "@orbit/shared/types";
import { radius } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";

type PendingOperationExecutionResult = {
  ok: boolean;
  error?: string;
  response?: AgentExecuteOperationResponse;
};

interface PendingOperationCardProps {
  pendingOperation: PendingAgentOperation;
  onConfirmExecute: (pendingOperationId: string) => Promise<PendingOperationExecutionResult>;
  onPrepareStepUp: (
    pendingOperationId: string,
  ) => Promise<{ ok: boolean; error?: string; challengeId?: string; confirmationToken?: string }>;
  onVerifyStepUp: (
    pendingOperationId: string,
    challengeId: string,
    code: string,
    confirmationToken: string,
  ) => Promise<PendingOperationExecutionResult>;
}

function formatRiskLabel(riskClass: PendingAgentOperation["riskClass"]): string {
  switch (riskClass) {
    case "High":
      return "High risk";
    case "Destructive":
      return "Destructive";
    default:
      return "Low risk";
  }
}

function resolveExecutionError(
  result: PendingOperationExecutionResult,
  fallback: string,
): string {
  return (
    result.error ??
    result.response?.operation.policyReason ??
    result.response?.policyDenial?.reason ??
    result.response?.operation.summary ??
    fallback
  );
}

export function PendingOperationCard({
  pendingOperation,
  onConfirmExecute,
  onPrepareStepUp,
  onVerifyStepUp,
}: Readonly<PendingOperationCardProps>) {
  const { t } = useTranslation();
  const { colors, shadows } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);

  const needsStepUp = pendingOperation.confirmationRequirement === "StepUp";
  const riskLabel = useMemo(
    () => formatRiskLabel(pendingOperation.riskClass),
    [pendingOperation.riskClass],
  );

  async function handleStart() {
    setIsLoading(true);
    setError(null);

    try {
      if (needsStepUp) {
        const result = await onPrepareStepUp(pendingOperation.id);
        if (!result.ok || !result.challengeId || !result.confirmationToken) {
          setError(result.error ?? t("chat.sendError"));
          return;
        }

        setChallengeId(result.challengeId);
        setConfirmationToken(result.confirmationToken);
        return;
      }

      const result = await onConfirmExecute(pendingOperation.id);
      if (!result.ok) {
        setError(result.error ?? t("chat.sendError"));
        return;
      }

      if (result.response && result.response.operation.status !== "Succeeded") {
        setError(resolveExecutionError(result, t("chat.sendError")));
        return;
      }

      setSuccessMessage(pendingOperation.summary);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerify() {
    if (!challengeId || !confirmationToken || verificationCode.trim().length < 6) {
      setError(t("auth.genericError"));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await onVerifyStepUp(
        pendingOperation.id,
        challengeId,
        verificationCode.trim(),
        confirmationToken,
      );

      if (!result.ok) {
        setError(result.error ?? t("chat.sendError"));
        return;
      }

      if (result.response && result.response.operation.status !== "Succeeded") {
        setError(resolveExecutionError(result, t("chat.sendError")));
        return;
      }

      setSuccessMessage(pendingOperation.summary);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <ShieldAlert size={16} color={colors.amber400} />
        </View>
        <View style={styles.headerText}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{pendingOperation.displayName}</Text>
            <View style={styles.riskPill}>
              <Text style={styles.riskPillText}>{riskLabel}</Text>
            </View>
          </View>
          <Text style={styles.summary}>{pendingOperation.summary}</Text>
        </View>
      </View>

      {challengeId && !successMessage ? (
        <View style={styles.verificationBlock}>
          <TextInput
            value={verificationCode}
            onChangeText={(value) =>
              setVerificationCode(value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="123456"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={6}
            style={styles.codeInput}
          />
          <TouchableOpacity
            style={[styles.primaryButton, verificationCode.trim().length < 6 && styles.disabled]}
            onPress={() => {
              void handleVerify();
            }}
            disabled={isLoading || verificationCode.trim().length < 6}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>{t("auth.verify")}</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.helper}>{t("auth.codeSent")}</Text>
        </View>
      ) : null}

      {!challengeId && !successMessage ? (
        <TouchableOpacity
          style={[styles.primaryButton, isLoading && styles.disabled]}
          onPress={() => {
            void handleStart();
          }}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {needsStepUp ? t("auth.sendCode") : t("common.confirm")}
            </Text>
          )}
        </TouchableOpacity>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}
    </View>
  );
}

function createStyles(
  colors: ReturnType<typeof useAppTheme>["colors"],
  shadows: ReturnType<typeof useAppTheme>["shadows"],
) {
  return StyleSheet.create({
    card: {
      marginTop: 12,
      gap: 12,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: "rgba(251,191,36,0.2)",
      backgroundColor: "rgba(251,191,36,0.08)",
      padding: 14,
      ...shadows.sm,
      elevation: 3,
    },
    header: {
      flexDirection: "row",
      gap: 10,
      alignItems: "flex-start",
    },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: "rgba(251,191,36,0.14)",
      alignItems: "center",
      justifyContent: "center",
    },
    headerText: {
      flex: 1,
      gap: 6,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    title: {
      flex: 1,
      fontSize: 13,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    riskPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: "rgba(251,191,36,0.2)",
      backgroundColor: "rgba(251,191,36,0.12)",
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    riskPillText: {
      fontSize: 9,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      color: colors.amber400,
    },
    summary: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    verificationBlock: {
      gap: 10,
    },
    codeInput: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.textPrimary,
      fontSize: 14,
      letterSpacing: 4,
      textAlign: "center",
    },
    primaryButton: {
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    primaryButtonText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.white,
    },
    disabled: {
      opacity: 0.5,
    },
    helper: {
      fontSize: 11,
      color: colors.textMuted,
    },
    error: {
      fontSize: 12,
      color: colors.red400,
    },
    success: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.emerald400,
    },
  });
}
