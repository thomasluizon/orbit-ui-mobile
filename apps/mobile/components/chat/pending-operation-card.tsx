import { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { ShieldAlert } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { AgentExecuteOperationResponse, PendingAgentOperation } from "@orbit/shared/types";
import { Badge } from "@/components/ui/badge";
import { PillButton } from "@/components/ui/pill-button";
import { createTokensV2 } from '@/lib/theme';
import { useAppTheme } from "@/lib/use-app-theme"

type AppTokens = ReturnType<typeof createTokensV2>;

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

function getRiskLabelKey(
  riskClass: PendingAgentOperation["riskClass"],
): "chat.pendingOp.risk.high" | "chat.pendingOp.risk.destructive" | "chat.pendingOp.risk.low" {
  switch (riskClass) {
    case "High":
      return "chat.pendingOp.risk.high";
    case "Destructive":
      return "chat.pendingOp.risk.destructive";
    default:
      return "chat.pendingOp.risk.low";
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
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);

  const needsStepUp = pendingOperation.confirmationRequirement === "StepUp";
  const riskLabel = t(getRiskLabelKey(pendingOperation.riskClass));

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
        <View style={styles.iconWell}>
          <ShieldAlert size={20} color={tokens.statusOverdue} strokeWidth={1.8} />
        </View>
        <View style={styles.headerText}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{pendingOperation.displayName}</Text>
            <Badge tone="amber">{riskLabel}</Badge>
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
            placeholder={t("common.codePlaceholder")}
            placeholderTextColor={tokens.fg3}
            keyboardType="number-pad"
            maxLength={6}
            style={styles.codeInput}
          />
          <PillButton
            style={styles.compactPill}
            disabled={isLoading || verificationCode.trim().length < 6}
            onPress={() => {
              void handleVerify();
            }}
            leading={
              isLoading ? <ActivityIndicator size="small" color={tokens.fgOnPrimary} /> : undefined
            }
          >
            <Text style={styles.primaryPillLabel}>{t("auth.verify")}</Text>
          </PillButton>
          <Text style={styles.helper}>{t("auth.codeSent")}</Text>
        </View>
      ) : null}

      {!challengeId && !successMessage ? (
        <PillButton
          style={styles.compactPill}
          disabled={isLoading}
          onPress={() => {
            void handleStart();
          }}
          leading={
            isLoading ? <ActivityIndicator size="small" color={tokens.fgOnPrimary} /> : undefined
          }
        >
          <Text style={styles.primaryPillLabel}>
            {needsStepUp ? t("auth.sendCode") : t("common.confirm")}
          </Text>
        </PillButton>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}
    </View>
  );
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    card: {
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgCard,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    header: {
      flexDirection: "row",
      gap: 12,
      alignItems: "center",
    },
    iconWell: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: tokens.bgElev,
      alignItems: "center",
      justifyContent: "center",
    },
    headerText: {
      flex: 1,
      gap: 2,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    title: {
      flex: 1,
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      color: tokens.fg1,
    },
    summary: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      lineHeight: 19,
      color: tokens.fg3,
    },
    verificationBlock: {
      gap: 10,
    },
    codeInput: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgField,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: tokens.fg1,
      fontFamily: 'Roboto_500Medium',
      fontSize: 16,
      letterSpacing: 4,
      textAlign: "center",
    },
    compactPill: {
      paddingVertical: 11,
      alignSelf: "stretch",
    },
    primaryPillLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fgOnPrimary,
    },
    helper: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 11,
      color: tokens.fg3,
    },
    error: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      color: tokens.statusBad,
    },
    success: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      color: tokens.statusDone,
    },
  });
}
