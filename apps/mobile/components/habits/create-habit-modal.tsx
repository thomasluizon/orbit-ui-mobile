import { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Trash2, Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { HabitFormFields } from "./habit-form-fields";
import { useHabitForm } from "@/hooks/use-habit-form";
import { useTagSelection } from "@/hooks/use-tag-selection";
import { useCreateHabit, useCreateSubHabit } from "@/hooks/use-habits";
import { formatAPIDate } from "@orbit/shared/utils";
import { useUIStore } from "@/stores/ui-store";
import type {
  NormalizedHabit,
  ScheduledReminderTime,
} from "@orbit/shared/types/habit";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prefillFromParent(
  parent: NormalizedHabit,
  formHelpers: ReturnType<typeof useHabitForm>,
  tags: ReturnType<typeof useTagSelection>,
  initialDate: string | null | undefined,
  setReminderTimes: (times: number[]) => void,
  setSelectedGoalIds: (ids: string[]) => void,
) {
  const { form } = formHelpers;
  const fallbackDate = initialDate ?? formatAPIDate(new Date());

  form.setValue("frequencyUnit", parent.frequencyUnit);
  form.setValue("frequencyQuantity", parent.frequencyQuantity);
  if (parent.days?.length) {
    form.setValue("days", [...parent.days]);
  }
  form.setValue("isBadHabit", parent.isBadHabit);
  form.setValue("isGeneral", parent.isGeneral ?? false);
  form.setValue("isFlexible", parent.isFlexible ?? false);
  form.setValue("slipAlertEnabled", parent.slipAlertEnabled ?? false);
  form.setValue("dueDate", parent.dueDate ?? fallbackDate);
  form.setValue("dueTime", parent.dueTime?.slice(0, 5) ?? "");
  form.setValue("dueEndTime", parent.dueEndTime?.slice(0, 5) ?? "");
  form.setValue("endDate", parent.endDate ?? "");
  form.setValue("reminderEnabled", parent.reminderEnabled ?? false);
  setReminderTimes(
    parent.reminderTimes?.length ? [...parent.reminderTimes] : [0, 15],
  );
  form.setValue(
    "scheduledReminders",
    parent.scheduledReminders?.length
      ? parent.scheduledReminders.map((sr: ScheduledReminderTime) => ({
          ...sr,
        }))
      : [],
  );

  if (parent.isGeneral) {
    formHelpers.setGeneral();
  } else if (parent.isFlexible) {
    formHelpers.setFlexible();
  } else if (parent.frequencyUnit) {
    formHelpers.setRecurring();
  } else {
    formHelpers.setOneTime();
  }

  tags.resetTags(parent.tags?.map((t) => t.id) ?? []);
  setSelectedGoalIds(parent.linkedGoals?.map((g) => g.id) ?? []);
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
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom]);
  const createHabit = useCreateHabit();
  const createSubHabit = useCreateSubHabit();
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
  const [validationError, setValidationError] = useState("");
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15]);

  const atGoalLimit = selectedGoalIds.length >= 10;

  const toggleGoal = useCallback((goalId: string) => {
    setSelectedGoalIds((prev) => {
      const idx = prev.indexOf(goalId);
      if (idx >= 0) return prev.filter((id) => id !== goalId);
      return [...prev, goalId];
    });
  }, []);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!open) return;

    formHelpers.form.reset({
      title: "",
      description: "",
      frequencyUnit: null,
      frequencyQuantity: null,
      days: [],
      isBadHabit: false,
      isGeneral: false,
      isFlexible: false,
      dueDate: initialDate ?? formatAPIDate(new Date()),
      dueTime: "",
      dueEndTime: "",
      endDate: "",
      reminderEnabled: false,
      scheduledReminders: [],
      slipAlertEnabled: false,
      checklistItems: [],
    });
    tags.resetTags();
    setSelectedGoalIds([]);
    setSubHabits([]);
    setValidationError("");
    setReminderTimes([0, 15]);

    if (parentHabit) {
      prefillFromParent(
        parentHabit,
        formHelpers,
        tags,
        initialDate,
        setReminderTimes,
        setSelectedGoalIds,
      );
    }

    if (activeView === "general") {
      formHelpers.setGeneral();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = useCallback(async () => {
    setValidationError("");

    const error = formHelpers.validateAll();
    if (error) {
      setValidationError(error);
      return;
    }

    const data = formHelpers.form.getValues() as unknown as HabitFormData;
    const subHabitValues = subHabits.map((entry) => entry.value);

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
    } catch {
      // Error handled by mutation
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
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <HabitFormFields
          formHelpers={formHelpers}
          tags={tags}
          selectedGoalIds={selectedGoalIds}
          atGoalLimit={atGoalLimit}
          onToggleGoal={toggleGoal}
          reminderTimes={reminderTimes}
          onReminderTimesChange={setReminderTimes}
        >
          {/* Sub-habits (create-only, not in sub-habit mode) */}
          {!isSubHabitMode && (
            <View style={styles.subHabitsSection}>
              <Text style={styles.label}>{t("habits.form.subHabits")}</Text>
              {subHabits.length > 0 && (
                <View style={styles.subHabitsList}>
                  {subHabits.map((entry) => (
                    <View key={entry.id} style={styles.subHabitRow}>
                      <TextInput
                        value={entry.value}
                        placeholder={t("habits.form.subHabitPlaceholder")}
                        placeholderTextColor={colors.textMuted}
                        style={[styles.input, { flex: 1 }]}
                        onChangeText={(val) =>
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

        {/* Validation error */}
        {validationError ? (
          <Text style={styles.errorText}>{validationError}</Text>
        ) : null}

        {/* Mutation error */}
        {(createHabit.error || createSubHabit.error) && (
          <Text style={styles.errorText}>
            {(createHabit.error || createSubHabit.error)?.message}
          </Text>
        )}

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
      </ScrollView>
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
