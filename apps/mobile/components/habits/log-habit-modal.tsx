import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useAppToast } from "@/hooks/use-app-toast";
import { useLogHabit } from "@/hooks/use-habits";
import {
  getFriendlyErrorMessage,
  translateErrorKey,
} from "@orbit/shared/utils";
import type { NormalizedHabit } from "@orbit/shared/types/habit";
import { validateHabitLogNote } from "@orbit/shared/validation";
import { AppTextInput } from "@/components/ui/app-text-input";
import { KeyboardAwareScrollView } from "@/components/ui/keyboard-aware-scroll-view";
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
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  );
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, insets.bottom),
    [colors, insets.bottom],
  );
  const logHabit = useLogHabit();
  const { showError } = useAppToast();

  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) {
      setNote("");
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (!habit) return;
    const noteError = translateErrorKey(translate, validateHabitLogNote(note));
    if (noteError) {
      showError(noteError);
      return;
    }
    try {
      await logHabit.mutateAsync({
        habitId: habit.id,
        note: note || undefined,
      });
      onLogged?.(habit.id);
      onClose();
      setNote("");
    } catch (error) {
      showError(
        getFriendlyErrorMessage(
          error,
          translate,
          "errors.logHabit",
          "habitLog",
        ),
      );
    }
  }, [habit, logHabit, note, onLogged, onClose, showError, translate]);

  const handleCancel = useCallback(() => {
    onClose();
    setNote("");
  }, [onClose]);

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={handleCancel} />
        <KeyboardAwareScrollView
          containerStyle={styles.keyboardContainer}
          contentContainerStyle={styles.sheetScrollContent}
          keyboardVerticalOffset={12}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{t("habits.log.title")}</Text>
              <TouchableOpacity
                style={styles.headerClose}
                onPress={handleCancel}
                activeOpacity={0.7}
              >
                <X size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {habit && (
              <View style={styles.content}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>{t("habits.log.habitLabel")}</Text>
                  <Text style={styles.habitTitle}>{habit.title}</Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>{t("habits.log.noteLabel")}</Text>
                  <AppTextInput
                    value={note}
                    placeholder={t("habits.log.notePlaceholder")}
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={3}
                    maxLength={500}
                    editable={!logHabit.isPending}
                    style={[styles.noteInput, logHabit.isPending && styles.disabled]}
                    onChangeText={setNote}
                    textAlignVertical="top"
                  />
                </View>

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
          </View>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(
  colors: ReturnType<typeof useAppTheme>["colors"],
  bottomInset: number,
) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    keyboardContainer: {
      flex: 1,
    },
    backdropPress: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    sheetScrollContent: {
      flexGrow: 1,
      justifyContent: "flex-end",
      paddingTop: 24,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 10,
      paddingBottom: 16,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      paddingHorizontal: 24,
      paddingTop: 10,
      paddingBottom: 16,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    headerClose: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
    },
    content: {
      gap: 16,
      paddingHorizontal: 20,
      paddingBottom: bottomInset + 12,
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
