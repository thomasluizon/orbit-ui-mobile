import { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { HabitFormFields } from "./habit-form-fields";
import { useHabitForm } from "@/hooks/use-habit-form";
import { useTagSelection } from "@/hooks/use-tag-selection";
import { useUpdateHabit, useHabitDetail } from "@/hooks/use-habits";
import { useAssignTags } from "@/hooks/use-tags";
import { getErrorMessage } from "@orbit/shared/utils";
import type { NormalizedHabit } from "@orbit/shared/types/habit";
import {
  buildUpdateHabitRequest,
  type HabitFormData,
} from "@/lib/habit-request-builders";
import { radius } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EditHabitModalProps {
  open: boolean;
  onClose: () => void;
  habit: NormalizedHabit | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditHabitModal({
  open,
  onClose,
  habit,
}: Readonly<EditHabitModalProps>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom]);
  const updateHabit = useUpdateHabit();
  const assignTags = useAssignTags();

  const formHelpers = useHabitForm();
  const tags = useTagSelection();
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);
  const [validationError, setValidationError] = useState("");
  const [detailFetchError, setDetailFetchError] = useState("");
  const [originalEndDate, setOriginalEndDate] = useState("");
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15]);

  const atGoalLimit = selectedGoalIds.length >= 10;

  // Fetch detail to get dueDate, dueTime, endDate etc.
  const { data: habitDetail, error: detailError } = useHabitDetail(
    open && habit ? habit.id : null,
  );

  const toggleGoal = useCallback((goalId: string) => {
    setSelectedGoalIds((prev) => {
      const idx = prev.indexOf(goalId);
      if (idx >= 0) return prev.filter((id) => id !== goalId);
      return [...prev, goalId];
    });
  }, []);

  // Show detail fetch error
  useEffect(() => {
    if (detailError) {
      setDetailFetchError(
        getErrorMessage(detailError, t("errors.fetchHabits")),
      );
    }
  }, [detailError, t]);

  // Populate form when modal opens or detail loads
  useEffect(() => {
    if (!open || !habit) return;

    setValidationError("");
    setDetailFetchError("");

    formHelpers.form.reset({
      title: habit.title,
      description: habit.description || "",
      frequencyUnit: habit.frequencyUnit,
      frequencyQuantity: habit.frequencyQuantity,
      days: [...(habit.days || [])],
      isBadHabit: habit.isBadHabit,
      isGeneral: habit.isGeneral ?? false,
      isFlexible: habit.isFlexible ?? false,
      dueDate: habitDetail?.dueDate ?? habit.dueDate ?? "",
      dueTime:
        habitDetail?.dueTime?.slice(0, 5) ?? habit.dueTime?.slice(0, 5) ?? "",
      dueEndTime:
        habitDetail?.dueEndTime?.slice(0, 5) ??
        habit.dueEndTime?.slice(0, 5) ??
        "",
      endDate: habitDetail?.endDate ?? "",
      reminderEnabled: habit.reminderEnabled ?? false,
      scheduledReminders: habit.scheduledReminders ?? [],
      slipAlertEnabled: habit.slipAlertEnabled ?? false,
      checklistItems: habit.checklistItems ? [...habit.checklistItems] : [],
    });

    setOriginalEndDate(habitDetail?.endDate ?? "");
    setReminderTimes(
      habit.reminderTimes?.length ? [...habit.reminderTimes] : [0, 15],
    );
    tags.resetTags(habit.tags?.map((tg) => tg.id) ?? []);
    setSelectedGoalIds(habit.linkedGoals?.map((g) => g.id) ?? []);

    // Set mode based on habit data
    if (habit.isGeneral) {
      formHelpers.setGeneral();
    } else if (habit.isFlexible) {
      formHelpers.setFlexible();
    } else if (habit.frequencyUnit) {
      formHelpers.setRecurring();
    } else {
      formHelpers.setOneTime();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, habit, habitDetail]);

  const handleSubmit = useCallback(async () => {
    if (!habit) return;
    setValidationError("");

    const error = formHelpers.validateAll();
    if (error) {
      setValidationError(error);
      return;
    }

    const data = formHelpers.form.getValues() as unknown as HabitFormData;
    const request = buildUpdateHabitRequest(
      data,
      formHelpers.isOneTime,
      originalEndDate,
      reminderTimes,
      selectedGoalIds,
    );

    try {
      await updateHabit.mutateAsync({ habitId: habit.id, data: request });
      await assignTags.mutateAsync({
        habitId: habit.id,
        tagIds: tags.selectedTagIds,
      });
      onClose();
    } catch {
      // Error handled by mutation
    }
  }, [
    habit,
    formHelpers,
    originalEndDate,
    selectedGoalIds,
    reminderTimes,
    tags,
    updateHabit,
    assignTags,
    onClose,
  ]);

  return (
    <BottomSheetModal
      open={open}
      onClose={onClose}
      title={t("habits.editHabit")}
      snapPoints={["80%", "95%"]}
    >
      <BottomSheetScrollView
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
        />

        {/* Detail fetch error */}
        {detailFetchError ? (
          <Text style={styles.errorText}>{detailFetchError}</Text>
        ) : null}

        {/* Validation error */}
        {validationError ? (
          <Text style={styles.errorText}>{validationError}</Text>
        ) : null}

        {/* Mutation error */}
        {updateHabit.error && (
          <Text style={styles.errorText}>{updateHabit.error.message}</Text>
        )}

        {/* Submit buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.cancelButton}
            disabled={updateHabit.isPending}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.submitButton,
              updateHabit.isPending && styles.disabled,
            ]}
            disabled={updateHabit.isPending}
            onPress={handleSubmit}
            activeOpacity={0.7}
          >
            {updateHabit.isPending && (
              <ActivityIndicator size="small" color={colors.white} />
            )}
            <Text style={styles.submitButtonText}>
              {t("habits.saveChanges")}
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
