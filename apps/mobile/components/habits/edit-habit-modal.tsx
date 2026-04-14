import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { HabitFormFields } from "./habit-form-fields";
import { KeyboardAwareBottomSheetScrollView } from "@/components/ui/keyboard-aware-scroll-view";
import { useAppToast } from "@/hooks/use-app-toast";
import { useDismissGuard } from "@/hooks/use-dismiss-guard";
import { useHabitForm } from "@/hooks/use-habit-form";
import { useTagSelection } from "@/hooks/use-tag-selection";
import { useUpdateHabit, useHabitDetail } from "@/hooks/use-habits";
import { useAssignTags } from "@/hooks/use-tags";
import {
  applyHabitFormMode,
  buildEditHabitFormState,
  getFriendlyErrorMessage,
  toggleSelectedId,
} from "@orbit/shared/utils";
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
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  );
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom]);
  const updateHabit = useUpdateHabit();
  const assignTags = useAssignTags();
  const { showError } = useAppToast();

  const formHelpers = useHabitForm();
  const tags = useTagSelection();
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);
  const [originalEndDate, setOriginalEndDate] = useState("");
  const [reminderTimes, setReminderTimes] = useState<number[]>([0, 15]);
  const flushBufferedInputsRef = useRef<() => void>(() => {});
  const [initialTagIds, setInitialTagIds] = useState("[]");
  const [initialGoalIds, setInitialGoalIds] = useState("[]");
  const [initialReminderTimes, setInitialReminderTimes] = useState("[0,15]");

  const atGoalLimit = selectedGoalIds.length >= 10;
  const isDirty =
    formHelpers.form.formState.isDirty ||
    JSON.stringify([...tags.selectedTagIds].sort()) !== initialTagIds ||
    JSON.stringify([...selectedGoalIds].sort()) !== initialGoalIds ||
    JSON.stringify(reminderTimes) !== initialReminderTimes;
  const dismissGuard = useDismissGuard({
    isDirty,
    onDismiss: onClose,
  });

  // Fetch detail to get dueDate, dueTime, endDate etc.
  const { data: habitDetail, error: detailError } = useHabitDetail(
    open && habit ? habit.id : null,
  );

  const toggleGoal = useCallback((goalId: string) => {
    setSelectedGoalIds((prev) => toggleSelectedId(prev, goalId));
  }, []);

  const handleBufferedInputsReady = useCallback((flush: () => void) => {
    flushBufferedInputsRef.current = flush;
  }, []);

  // Show detail fetch error
  useEffect(() => {
    if (detailError) {
      showError(
        getFriendlyErrorMessage(
          detailError,
          translate,
          "errors.fetchHabits",
          "habit",
        ),
      );
    }
  }, [detailError, showError, translate]);

  // Populate form when the modal session starts and once detail loads.
  // Avoid rehydrating on every background refetch while the user is typing.
  useEffect(() => {
    if (!open || !habit) return;

    const prefill = buildEditHabitFormState(habit, habitDetail);
    formHelpers.form.reset(prefill.formValues);
    setOriginalEndDate(prefill.originalEndDate);
    setReminderTimes(prefill.reminderTimes);
    tags.resetTags(prefill.selectedTagIds);
    setSelectedGoalIds(prefill.selectedGoalIds);
    setInitialTagIds(JSON.stringify([...prefill.selectedTagIds].sort()));
    setInitialGoalIds(JSON.stringify([...prefill.selectedGoalIds].sort()));
    setInitialReminderTimes(JSON.stringify(prefill.reminderTimes));
    applyHabitFormMode(prefill.mode, formHelpers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, habit?.id, habitDetail?.id]);

  const handleSubmit = useCallback(async () => {
    if (!habit) return;
    flushBufferedInputsRef.current();
    const data = formHelpers.form.getValues() as unknown as HabitFormData;
    const error = formHelpers.validateAll({
      reminderTimes,
      selectedGoalIds,
      selectedTagIds: tags.selectedTagIds,
    });
    if (error) {
      showError(error);
      return;
    }

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
    } catch (error) {
      showError(
        getFriendlyErrorMessage(
          error,
          translate,
          "errors.updateHabit",
          "habit",
        ),
      );
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
    showError,
    translate,
  ]);

  return (
    <>
      <BottomSheetModal
        open={open}
        onClose={onClose}
        title={t("habits.editHabit")}
        snapPoints={["80%", "95%"]}
        formMode
        canDismiss={dismissGuard.canDismiss}
        isDirty={isDirty}
        onAttemptDismiss={dismissGuard.requestDismiss}
      >
      <KeyboardAwareBottomSheetScrollView
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
          onFlushBufferedInputsReady={handleBufferedInputsReady}
          defaultExpanded={true}
        />

        {/* Submit buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.cancelButton}
            disabled={updateHabit.isPending}
            onPress={dismissGuard.requestDismiss}
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
      </KeyboardAwareBottomSheetScrollView>
    </BottomSheetModal>
      <ConfirmDialog
        open={dismissGuard.showDiscardDialog}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) dismissGuard.cancelDismiss();
        }}
        title={t("common.discardChangesTitle")}
        description={t("common.discardChangesDescription")}
        confirmLabel={t("common.discard")}
        cancelLabel={t("common.keepEditing")}
        onConfirm={dismissGuard.confirmDismiss}
        onCancel={dismissGuard.cancelDismiss}
        variant="warning"
      />
    </>
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
