import { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from "react-native";
import Animated, { Keyframe, ReduceMotion } from "react-native-reanimated";
import { ShieldAlert } from '@/components/ui/icons';
import { useTranslation } from "react-i18next";
import type { AgentExecuteOperationResponse, PendingAgentOperation } from "@orbit/shared/types";
import {
  getAgentCapabilityLabelKey,
  getAgentPolicyReasonKey,
} from "@orbit/shared/utils";
import { Badge } from "@/components/ui/badge";
import { PillButton } from "@/components/ui/pill-button";
import { createTokensV2 } from '@/lib/theme';
import { useAppTheme } from "@/lib/use-app-theme"

type AppTokens = ReturnType<typeof createTokensV2>;

const CARD_EXIT = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: { opacity: 0, transform: [{ translateY: -4 }] },
})
  .duration(160)
  .reduceMotion(ReduceMotion.System);

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
  translate: (key: string) => string,
  fallback: string,
): string {
  const reasonKey = getAgentPolicyReasonKey(
    result.response?.operation.policyReason ?? result.response?.policyDenial?.reason,
  );
  if (reasonKey) return translate(reasonKey);
  return result.error ?? fallback;
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
  const confirmationTokenRef = useRef<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const needsStepUp = pendingOperation.confirmationRequirement === "StepUp";
  const riskLabel = t(getRiskLabelKey(pendingOperation.riskClass));
  const capabilityLabelKey = getAgentCapabilityLabelKey(pendingOperation.capabilityId);
  const operationName = capabilityLabelKey
    ? t(capabilityLabelKey)
    : pendingOperation.displayName;
  const operationSummary = t("chat.pendingOp.summary", { name: operationName });

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

        confirmationTokenRef.current = result.confirmationToken;
        setChallengeId(result.challengeId);
        return;
      }

      const result = await onConfirmExecute(pendingOperation.id);
      if (!result.ok) {
        setError(result.error ?? t("chat.sendError"));
        return;
      }

      if (result.response && result.response.operation.status !== "Succeeded") {
        setError(resolveExecutionError(result, t, t("chat.sendError")));
        return;
      }

      setSuccessMessage(t("chat.pendingOp.confirmed"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerify() {
    const confirmationToken = confirmationTokenRef.current;
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
        setError(resolveExecutionError(result, t, t("chat.sendError")));
        return;
      }

      setSuccessMessage(t("chat.pendingOp.confirmed"));
    } finally {
      setIsLoading(false);
    }
  }

  if (dismissed) {
    return null;
  }

  return (
    <Animated.View exiting={CARD_EXIT} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWell}>
          <ShieldAlert size={20} color={tokens.statusOverdue} strokeWidth={1.8} />
        </View>
        <View style={styles.headerText}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{operationName}</Text>
            <Badge tone="amber">{riskLabel}</Badge>
          </View>
          <Text style={styles.summary}>{operationSummary}</Text>
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
            size="sm"
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
        <View style={styles.actions}>
          <PillButton
            size="sm"
            style={styles.confirmPill}
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
          <PillButton
            variant="ghost"
            size="sm"
            disabled={isLoading}
            accessibilityLabel={t("common.cancel")}
            onPress={() => setDismissed(true)}
          >
            <Text style={styles.cancelPillLabel}>{t("common.cancel")}</Text>
          </PillButton>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}
    </Animated.View>
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
      padding: 16,
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
      alignSelf: "stretch",
    },
    actions: {
      flexDirection: "row",
      gap: 8,
    },
    confirmPill: {
      flex: 1,
    },
    cancelPillLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fg1,
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
      color: tokens.statusBadText,
    },
    success: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      color: tokens.statusDone,
    },
  });
}
