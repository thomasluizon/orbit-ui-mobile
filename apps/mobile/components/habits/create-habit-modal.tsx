import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useWatch } from "react-hook-form";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Trash2, Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { BottomSheetAppTextInput } from "@/components/ui/bottom-sheet-app-text-input";
import { HabitFormFields } from "./habit-form-fields";
import { useAppToast } from "@/hooks/use-app-toast";
import { useHabitForm } from "@/hooks/use-habit-form";
import { useTagSelection } from "@/hooks/use-tag-selection";
import { useCreateHabit, useCreateSubHabit } from "@/hooks/use-habits";
import {
  applyHabitFormMode,
  buildEmptyHabitFormValues,
  buildParentHabitFormState,
  formatAPIDate,
  getFriendlyErrorMessage,
  resolveAutoManagedReminderEnabled,
  toggleSelectedId,
} from "@orbit/shared/utils";
import { useUIStore } from "@/stores/ui-store";
import type { NormalizedHabit } from "@orbit/shared/types/habit";
import {
  buildSubHabitRequest,
  buildCreateHabitRequest,
  type HabitFormData,
} from "@/lib/habit-request-builders";
import { radius } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubHabitEntry {
  id: string;
  value: string;
}

let subHabitCounter = 0;
function createSubHabitEntry(value = ""): SubHabitEntry {
  subHabitCounter += 1;
  return { id: `sub-${subHabitCounter}-${Date.now()}`, value };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateHabitModalProps {
  open: boolean;
  onClose: () => void;
  initialDate?: string | null;
  parentHabit?: NormalizedHabit | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateHabitModal({
  open,
  onClose,
  initialDate,
  parentHabit,
}: Readonly<CreateHabitModalProps>) {
  const { t } = useTranslation();
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  );
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom]);
  const createHabit = useCreateHabit();
  const createSubHabit = useCreateSubHabit();
  const { showError } = useAppToast();
  const isSubHabitMode = !!parentHabit;
  const activeView = useUIStore((s) => s.activeView);

  const formHelpers = useHabitForm({
    initialData: {
      dueDate: initialDate ?? formatAPIDate(new Date()),
    },
  });

  const tags = useTagSelection();
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);
  const [subHabits, setSubHabits] = useState<SubHabitEntry[]>([]);
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15]);
  const reminderWasManuallyToggledRef = useRef(false);
  const flushBufferedInputsRef = useRef<() => void>(() => {});

  const watchedDueTime = useWatch({
    control: formHelpers.form.control,
    name: "dueTime",
  }) ?? "";
  const watchedReminderEnabled = useWatch({
    control: formHelpers.form.control,
    name: "reminderEnabled",
  }) ?? false;
  const watchedScheduledReminders = useWatch({
    control: formHelpers.form.control,
    name: "scheduledReminders",
  }) ?? [];

  const atGoalLimit = selectedGoalIds.length >= 10;

  const toggleGoal = useCallback((goalId: string) => {
    setSelectedGoalIds((prev) => toggleSelectedId(prev, goalId));
  }, []);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!open) return;

    const fallbackDate = initialDate ?? formatAPIDate(new Date());

    reminderWasManuallyToggledRef.current = false;
    formHelpers.form.reset(buildEmptyHabitFormValues(fallbackDate));
    tags.resetTags();
    setSelectedGoalIds([]);
    setSubHabits([]);
    setReminderTimes([0, 15]);

    if (parentHabit) {
      const prefill = buildParentHabitFormState(parentHabit, fallbackDate);
      formHelpers.form.reset(prefill.formValues);
      applyHabitFormMode(prefill.mode, formHelpers);
      tags.resetTags(prefill.selectedTagIds);
      setSelectedGoalIds(prefill.selectedGoalIds);
      setReminderTimes(prefill.reminderTimes);
    } else if (activeView === "general") {
      formHelpers.setGeneral();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const nextReminderEnabled = resolveAutoManagedReminderEnabled({
      dueTime: watchedDueTime,
      scheduledReminderCount: watchedScheduledReminders.length,
      reminderEnabled: watchedReminderEnabled,
      reminderWasManuallyToggled: reminderWasManuallyToggledRef.current,
    });

    if (nextReminderEnabled === null || nextReminderEnabled === watchedReminderEnabled) {
      return;
    }

    formHelpers.form.setValue("reminderEnabled", nextReminderEnabled, {
      shouldDirty: true,
    });
  }, [
    formHelpers.form,
    open,
    watchedDueTime,
    watchedReminderEnabled,
    watchedScheduledReminders.length,
  ]);

  const handleReminderEnabledChange = useCallback((nextEnabled: boolean) => {
    reminderWasManuallyToggledRef.current = true;
    formHelpers.form.setValue("reminderEnabled", nextEnabled, {
      shouldDirty: true,
    });
  }, [formHelpers.form]);

  const handleBufferedInputsReady = useCallback((flush: () => void) => {
    flushBufferedInputsRef.current = flush;
  }, []);

  const handleSubmit = useCallback(async () => {
    flushBufferedInputsRef.current();
    const data = formHelpers.form.getValues() as unknown as HabitFormData;
    const subHabitValues = subHabits.map((entry) => entry.value);
    const error = formHelpers.validateAll({
      reminderTimes,
      selectedGoalIds,
      selectedTagIds: tags.selectedTagIds,
      subHabits: subHabitValues,
    });
    if (error) {
      showError(error);
      return;
    }

    try {
      if (isSubHabitMode && parentHabit) {
        const subRequest = buildSubHabitRequest(
          data,
          reminderTimes,
          tags.selectedTagIds,
        );
        await createSubHabit.mutateAsync({
          parentId: parentHabit.id,
          data: subRequest,
        });
      } else {
        const request = buildCreateHabitRequest(
          data,
          reminderTimes,
          tags.selectedTagIds,
          selectedGoalIds,
          subHabitValues,
        );
        await createHabit.mutateAsync(request);
      }
      onClose();
    } catch (error) {
      showError(
        getFriendlyErrorMessage(
          error,
          translate,
          isSubHabitMode ? "errors.createSubHabit" : "errors.createHabit",
          isSubHabitMode ? "subHabit" : "habit",
        ),
      );
    }
  }, [
    formHelpers,
    isSubHabitMode,
    parentHabit,
    tags,
    selectedGoalIds,
    subHabits,
    reminderTimes,
    createHabit,
    createSubHabit,
    onClose,
    showError,
    translate,
  ]);

  const isPending = createHabit.isPending || createSubHabit.isPending;

  const updateSubHabitValue = useCallback((id: string, value: string) => {
    setSubHabits((prev) =>
      prev.map((s) => (s.id === id ? { ...s, value } : s)),
    );
  }, []);

  const removeSubHabit = useCallback((id: string) => {
    setSubHabits((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return (
    <BottomSheetModal
      open={open}
      onClose={onClose}
      title={
        isSubHabitMode ? t("habits.createSubHabit") : t("habits.createHabit")
      }
      snapPoints={["80%", "95%"]}
      formMode
    >
      <BottomSheetScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        <HabitFormFields
          formHelpers={formHelpers}
          tags={tags}
          selectedGoalIds={selectedGoalIds}
          atGoalLimit={atGoalLimit}
          onToggleGoal={toggleGoal}
          reminderTimes={reminderTimes}
          onReminderTimesChange={setReminderTimes}
          onReminderEnabledChange={handleReminderEnabledChange}
          onFlushBufferedInputsReady={handleBufferedInputsReady}
        >
          {/* Sub-habits (create-only, not in sub-habit mode) */}
          {!isSubHabitMode && (
            <View style={styles.subHabitsSection}>
              <Text style={styles.label}>{t("habits.form.subHabits")}</Text>
              {subHabits.length > 0 && (
                <View style={styles.subHabitsList}>
                  {subHabits.map((entry) => (
                    <View key={entry.id} style={styles.subHabitRow}>
                      <BottomSheetAppTextInput
                        value={entry.value}
                        maxLength={200}
                        placeholder={t("habits.form.subHabitPlaceholder")}
                        placeholderTextColor={colors.textMuted}
                        style={[styles.input, { flex: 1 }]}
                        onChangeText={(val: string) =>
                          updateSubHabitValue(entry.id, val)
                        }
                      />
                      <TouchableOpacity
                        style={styles.removeSubHabit}
                        onPress={() => removeSubHabit(entry.id)}
                        activeOpacity={0.7}
                      >
                        <Trash2 size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              <TouchableOpacity
                style={styles.addSubHabitButton}
                disabled={subHabits.length >= 20}
                onPress={() =>
                  setSubHabits((prev) => [...prev, createSubHabitEntry()])
                }
                activeOpacity={0.7}
              >
                <Plus size={14} color={colors.primary} />
                <Text style={styles.addSubHabitText}>
                  {t("habits.form.addSubHabit")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </HabitFormFields>

        {/* Submit buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.cancelButton}
            disabled={isPending}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitButton, isPending && styles.disabled]}
            disabled={isPending}
            onPress={handleSubmit}
            activeOpacity={0.7}
          >
            {isPending && (
              <ActivityIndicator size="small" color={colors.white} />
            )}
            <Text style={styles.submitButtonText}>
              {isSubHabitMode
                ? t("habits.createSubHabit")
                : t("habits.createHabit")}
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
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
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: bottomInset + 120,
      gap: 20,
    },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      borderRadius: radius.lg,
      paddingVertical: 12,
      paddingHorizontal: 16,
      fontSize: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    subHabitsSection: {
      gap: 6,
    },
    subHabitsList: {
      gap: 6,
    },
    subHabitRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    removeSubHabit: {
      padding: 8,
      borderRadius: radius.full,
    },
    addSubHabitButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    addSubHabitText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.primary,
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
