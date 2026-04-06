import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { useLogHabit } from "@/hooks/use-habits";
import type { NormalizedHabit } from "@orbit/shared/types/habit";
import { radius } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LogHabitModalProps {
  open: boolean;
  onClose: () => void;
  habit: NormalizedHabit | null;
  onLogged?: (habitId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LogHabitModal({
  open,
  onClose,
  habit,
  onLogged,
}: Readonly<LogHabitModalProps>) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const logHabit = useLogHabit();

  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) setNote("");
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (!habit) return;
    try {
      await logHabit.mutateAsync({
        habitId: habit.id,
        note: note || undefined,
      });
      onLogged?.(habit.id);
      onClose();
      setNote("");
    } catch {
      // Error handled by mutation
    }
  }, [habit, note, logHabit, onLogged, onClose]);

  const handleCancel = useCallback(() => {
    onClose();
    setNote("");
  }, [onClose]);

  return (
    <BottomSheetModal
      open={open}
      onClose={handleCancel}
      title={t("habits.log.title")}
      snapPoints={["45%"]}
    >
      {habit && (
        <View style={styles.content}>
          {/* Habit title */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("habits.log.habitLabel")}</Text>
            <Text style={styles.habitTitle}>{habit.title}</Text>
          </View>

          {/* Note input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("habits.log.noteLabel")}</Text>
            <TextInput
              value={note}
              placeholder={t("habits.log.notePlaceholder")}
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              editable={!logHabit.isPending}
              style={[styles.noteInput, logHabit.isPending && styles.disabled]}
              onChangeText={setNote}
              textAlignVertical="top"
            />
          </View>

          {/* Mutation error */}
          {logHabit.error && (
            <Text style={styles.errorText}>{logHabit.error.message}</Text>
          )}

          {/* Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              disabled={logHabit.isPending}
              onPress={handleCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.submitButton,
                logHabit.isPending && styles.disabled,
              ]}
              disabled={logHabit.isPending}
              onPress={handleSubmit}
              activeOpacity={0.7}
            >
              {logHabit.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Check size={16} color={colors.white} />
              )}
              <Text style={styles.submitButtonText}>
                {t("habits.logHabit")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </BottomSheetModal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    content: {
      gap: 16,
    },
    fieldGroup: {
      gap: 4,
    },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    habitTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    noteInput: {
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      borderRadius: radius.md,
      paddingVertical: 12,
      paddingHorizontal: 16,
      fontSize: 14,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 80,
    },
    errorText: {
      fontSize: 14,
      color: colors.red500,
      fontWeight: "500",
    },
    buttonRow: {
      flexDirection: "row",
      gap: 12,
      paddingTop: 12,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    submitButton: {
      flex: 2,
      paddingVertical: 14,
      borderRadius: radius.xl,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    submitButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.white,
    },
    disabled: {
      opacity: 0.5,
    },
  });
}
