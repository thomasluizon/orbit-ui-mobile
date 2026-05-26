import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  LayoutAnimation,
} from "react-native";
import { useWatch } from "react-hook-form";
import {
  X,
  Plus,
  Check,
  CalendarCheck,
  Repeat,
  Shuffle,
  Infinity,
  ChevronDown,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { FrequencyUnit } from "@orbit/shared/types/habit";
import {
  HABIT_REMINDER_PRESETS,
  getFriendlyErrorMessage,
} from "@orbit/shared/utils";
import { validateTagForm } from "@orbit/shared/validation";
import { HabitChecklist } from "./habit-checklist";
import { ChecklistTemplates } from "./checklist-templates";
import { GoalLinkingField } from "./goal-linking-field";
import type { TagSelectionState } from "@/hooks/use-tag-selection";
import type { HabitFormHelpers } from "@/hooks/use-habit-form";
import { useAppToast } from "@/hooks/use-app-toast";
import { useHasProAccess } from "@/hooks/use-profile";
import {
  useCreateTag,
  useDeleteTag,
  useTags,
  useUpdateTag,
} from "@/hooks/use-tags";
import { AppDatePicker } from "@/components/ui/app-date-picker";
import { AppTimePicker } from "@/components/ui/app-time-picker";
import { AppSelect } from "@/components/ui/app-select";
import { BottomSheetAppTextInput } from "@/components/ui/bottom-sheet-app-text-input";
import { createTokensV2 } from '@/lib/theme';
import { useAppTheme } from "@/lib/use-app-theme";
import {
  createSectionStyles,
  createStyles,
} from "./habit-form-fields/styles";
import { ChoiceButtonRow } from "./habit-form-fields/choice-button-row";
import { HabitEmojiSelector } from "./habit-form-fields/habit-emoji-selector";
import { TagColorPicker } from "./habit-form-fields/tag-color-picker";
import { TagEditorRow } from "./habit-form-fields/tag-editor-row";
import { BufferedSheetInput } from "./habit-form-fields/buffered-sheet-input";
import { HabitTagChip } from "./habit-form-fields/habit-tag-chip";
import { ReminderSection } from "./habit-form-fields/reminder-section";
import { ScheduledReminderSection } from "./habit-form-fields/scheduled-reminder-section";
import { SlipAlertSection } from "./habit-form-fields/slip-alert-section";

interface HabitFormFieldsProps {
  formHelpers: HabitFormHelpers;
  tags: TagSelectionState;
  selectedGoalIds: string[];
  atGoalLimit: boolean;
  onToggleGoal: (goalId: string) => void;
  reminderTimes: number[];
  onReminderTimesChange: (times: number[]) => void;
  onReminderEnabledChange?: (nextEnabled: boolean) => void;
  onFlushBufferedInputsReady?: (flush: () => void) => void;
  /** When true, advanced fields are visible by default (used in edit modal) */
  defaultExpanded?: boolean;
  children?: ReactNode;
}

const FREQUENCY_TYPE_CARDS = [
  {
    key: "one-time",
    icon: CalendarCheck,
    titleKey: "habits.form.oneTimeTask",
    descKey: "habits.form.oneTimeDescription",
    exampleKey: "habits.form.oneTimeExample",
  },
  {
    key: "recurring",
    icon: Repeat,
    titleKey: "habits.form.recurring",
    descKey: "habits.form.recurringDescription",
    exampleKey: "habits.form.recurringExample",
  },
  {
    key: "flexible",
    icon: Shuffle,
    titleKey: "habits.form.flexible",
    descKey: "habits.form.flexibleDescription2",
    exampleKey: "habits.form.flexibleExample2",
  },
  {
    key: "general",
    icon: Infinity,
    titleKey: "habits.form.general",
    descKey: "habits.form.generalDescription",
    exampleKey: "habits.form.generalExample",
  },
] as const;

export function HabitFormFields({
  formHelpers,
  tags,
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
  reminderTimes,
  onReminderTimesChange,
  onReminderEnabledChange,
  onFlushBufferedInputsReady,
  defaultExpanded = false,
  children,
}: Readonly<HabitFormFieldsProps>) {
  const { t } = useTranslation();
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  );
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const { showError } = useAppToast();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const sectionStyles = useMemo(() => createSectionStyles(tokens), [tokens]);
  const hasProAccess = useHasProAccess();
  const { tags: availableTags } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const isTagMutationPending =
    createTag.isPending || updateTag.isPending || deleteTag.isPending;

  const {
    form,
    isOneTime,
    isGeneral,
    isFlexible,
    showDayPicker,
    showEndDate,
    daysList,
    frequencyUnits,
    setOneTime,
    setRecurring,
    setFlexible,
    setGeneral,
    toggleDay,
  } = formHelpers;

  const { setValue, formState: { errors } } = form;
  const bufferedInputFlushersRef = useRef(new Set<() => void>());

  const registerBufferedInputFlusher = useCallback((flush: () => void) => {
    bufferedInputFlushersRef.current.add(flush);
    return () => {
      bufferedInputFlushersRef.current.delete(flush);
    };
  }, []);

  const flushBufferedInputs = useCallback(() => {
    bufferedInputFlushersRef.current.forEach((flush) => flush());
  }, []);

  const watchedFrequencyUnit = useWatch({
    control: form.control,
    name: "frequencyUnit",
  }) ?? null;
  const watchedFrequencyQuantity = useWatch({
    control: form.control,
    name: "frequencyQuantity",
  }) ?? null;
  const watchedDays = useWatch({ control: form.control, name: "days" }) ?? [];
  const watchedDueDate = useWatch({ control: form.control, name: "dueDate" }) ?? "";
  const watchedDueTime = useWatch({ control: form.control, name: "dueTime" }) ?? "";
  const watchedDueEndTime = useWatch({
    control: form.control,
    name: "dueEndTime",
  }) ?? "";
  const watchedEndDate = useWatch({ control: form.control, name: "endDate" }) ?? "";
  const watchedIsBadHabit = useWatch({
    control: form.control,
    name: "isBadHabit",
  }) ?? false;
  const watchedReminderEnabled = useWatch({
    control: form.control,
    name: "reminderEnabled",
  }) ?? false;
  const watchedSlipAlertEnabled = useWatch({
    control: form.control,
    name: "slipAlertEnabled",
  }) ?? false;
  const rawWatchedChecklistItems = useWatch({
    control: form.control,
    name: "checklistItems",
  });
  const watchedChecklistItems = useMemo(
    () => rawWatchedChecklistItems ?? [],
    [rawWatchedChecklistItems],
  );
  const watchedScheduledReminders = useWatch({
    control: form.control,
    name: "scheduledReminders",
  }) ?? [];
  const watchedTitle = useWatch({ control: form.control, name: "title" }) ?? "";
  const watchedDescription = useWatch({
    control: form.control,
    name: "description",
  }) ?? "";
  const watchedEmoji = useWatch({ control: form.control, name: "emoji" }) ?? "";

  function reminderLabel(minutes: number): string {
    const preset = HABIT_REMINDER_PRESETS.find((p) => p.value === minutes);
    if (preset) return t(preset.key);
    if (minutes < 60) return `${minutes} ${t("habits.form.reminderMinutes")}`;
    if (minutes < 1440) {
      const h = Math.floor(minutes / 60);
      return `${h} ${t(h === 1 ? "habits.form.reminderHour" : "habits.form.reminderHours")}`;
    }
    const d = Math.floor(minutes / 1440);
    return `${d} ${t(d === 1 ? "habits.form.reminderDay" : "habits.form.reminderDays")}`;
  }

  const handleReminderEnabledChange = useCallback(
    (nextEnabled: boolean) => {
      if (onReminderEnabledChange) {
        onReminderEnabledChange(nextEnabled);
        return;
      }
      setValue("reminderEnabled", nextEnabled, { shouldDirty: true });
    },
    [onReminderEnabledChange, setValue],
  );

  const [showAdvanced, setShowAdvanced] = useState(defaultExpanded);

  function toggleAdvanced() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAdvanced((prev) => !prev);
  }

  const activeFrequencyKey = isOneTime
    ? "one-time"
    : isGeneral
      ? "general"
      : isFlexible
        ? "flexible"
        : "recurring";

  const frequencyHandlers: Record<string, () => void> = useMemo(
    () => ({
      "one-time": setOneTime,
      recurring: setRecurring,
      flexible: setFlexible,
      general: setGeneral,
    }),
    [setOneTime, setRecurring, setFlexible, setGeneral],
  );

  const advancedFieldCount = useMemo(() => {
    return [
      watchedDescription.length > 0,
      watchedChecklistItems.length > 0,
      watchedEndDate.length > 0,
      watchedReminderEnabled,
      selectedGoalIds.length > 0,
      watchedIsBadHabit,
    ].filter(Boolean).length;
  }, [
    watchedDescription,
    watchedChecklistItems,
    watchedEndDate,
    watchedReminderEnabled,
    selectedGoalIds,
    watchedIsBadHabit,
  ]);

  useEffect(() => {
    if (!onFlushBufferedInputsReady) {
      return;
    }

    onFlushBufferedInputsReady(flushBufferedInputs);

    return () => {
      onFlushBufferedInputsReady(() => {});
    };
  }, [flushBufferedInputs, onFlushBufferedInputsReady]);

  return (
    <View style={styles.container}>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t("habits.form.title")}</Text>
        <BufferedSheetInput
          value={watchedTitle}
          registerFlush={registerBufferedInputFlusher}
          maxLength={200}
          placeholder={t("habits.form.titlePlaceholder")}
          placeholderTextColor={tokens.fg3}
          style={styles.input}
          onCommit={(val) => setValue("title", val, { shouldDirty: true })}
          accessibilityLabel={t("habits.form.title")}
        />
        {errors.title && (
          <Text style={styles.fieldError} accessibilityRole="alert">
            {errors.title.message}
          </Text>
        )}
      </View>

      <HabitEmojiSelector
        selectedEmoji={watchedEmoji}
        tokens={tokens}
        styles={styles}
        onSelect={(emoji) => setValue("emoji", emoji, { shouldDirty: true })}
      />

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t("habits.form.frequency")}</Text>
        <View style={styles.frequencyCardGrid}>
          {FREQUENCY_TYPE_CARDS.map((card) => {
            const isActive = activeFrequencyKey === card.key;
            const CardIcon = card.icon;
            return (
              <TouchableOpacity
                key={card.key}
                style={[
                  styles.frequencyCard,
                  isActive
                    ? styles.frequencyCardActive
                    : styles.frequencyCardInactive,
                ]}
                onPress={frequencyHandlers[card.key]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <View style={styles.frequencyCardHeader}>
                  <CardIcon
                    size={18}
                    color={isActive ? tokens.fg1 : tokens.fg3}
                  />
                  <Text
                    style={[
                      styles.frequencyCardTitle,
                      isActive
                        ? styles.frequencyCardTitleActive
                        : styles.frequencyCardTitleInactive,
                    ]}
                  >
                    {t(card.titleKey)}
                  </Text>
                </View>
                {isActive && (
                  <View style={styles.frequencyCardBody}>
                    <Text style={styles.frequencyCardDesc}>
                      {t(card.descKey)}
                    </Text>
                    <Text style={styles.frequencyCardExample}>
                      {t(card.exampleKey)}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {isFlexible && (
        <Text style={styles.flexibleHint}>
          {t("habits.form.flexibleDescription", {
            n: watchedFrequencyQuantity ?? 3,
            unit: watchedFrequencyUnit
              ? t(
                  `habits.form.unit${watchedFrequencyUnit}` as "habits.form.unitDay",
                )
              : "",
          })}
        </Text>
      )}

      {!isOneTime && !isGeneral && (
        <View style={styles.frequencyRow}>
          <View style={styles.frequencyField}>
            <Text style={styles.label}>
              {isFlexible
                ? t("habits.form.timesPerUnit")
                : t("habits.form.every")}
            </Text>
            <BottomSheetAppTextInput
              value={String(watchedFrequencyQuantity ?? "")}
              keyboardType="number-pad"
              style={styles.input}
              onChangeText={(val: string) => {
                const num = Number(val);
                if (!val) {
                  setValue("frequencyQuantity", null, { shouldDirty: true });
                } else if (!Number.isNaN(num)) {
                  setValue("frequencyQuantity", num, { shouldDirty: true });
                }
              }}
            />
          </View>
          <View style={styles.frequencyField}>
            <Text style={styles.label}>{t("habits.form.unit")}</Text>
            <AppSelect
              value={watchedFrequencyUnit ?? null}
              options={frequencyUnits.map((unit) => ({
                value: unit.value,
                label: unit.label,
              }))}
              label={t("habits.form.unit")}
              onChange={(value) =>
                setValue("frequencyUnit", value as FrequencyUnit, {
                  shouldDirty: true,
                })
              }
            />
          </View>
        </View>
      )}

      {showDayPicker && !isGeneral && (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("habits.form.activeDays")}</Text>
          <ChoiceButtonRow
            containerStyle={styles.daysRow}
            buttonStyle={styles.dayButton}
            activeButtonStyle={styles.dayButtonActive}
            textStyle={styles.dayButtonText}
            activeTextStyle={styles.dayButtonTextActive}
            options={daysList.map((day) => ({
              key: day.value,
              label: day.label,
              active: watchedDays?.includes(day.value) ?? false,
              onPress: () => toggleDay(day.value),
            }))}
          />
        </View>
      )}

      {!isGeneral && (
        <View style={styles.dueDateRow}>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.label}>{t("habits.form.dueDate")}</Text>
            <AppDatePicker
              value={watchedDueDate}
              placeholder={t("common.selectDate")}
              onChange={(value) =>
                setValue("dueDate", value, { shouldDirty: true })
              }
            />
          </View>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.label}>{t("habits.form.dueTime")}</Text>
            <AppTimePicker
              value={watchedDueTime}
              placeholder={t("habits.form.scheduledReminderTimePlaceholder")}
              accessibilityLabel={t("habits.form.dueTime")}
              onChange={(nextValue) =>
                setValue("dueTime", nextValue, { shouldDirty: true })
              }
              onClear={() => {
                setValue("dueTime", "", { shouldDirty: true })
                setValue("dueEndTime", "", { shouldDirty: true })
              }}
            />
          </View>
        </View>
      )}

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t("habits.form.tags")}</Text>
        <View style={styles.tagsRow}>
          {availableTags.map((tag) => {
            const isSelected = tags.selectedTagIds.includes(tag.id);
            const isDisabled = !isSelected && tags.atTagLimit;
            return (
              <HabitTagChip
                key={tag.id}
                tag={tag}
                selected={isSelected}
                atLimit={isDisabled}
                disabled={isTagMutationPending}
                styles={styles}
                tokens={tokens}
                onToggle={() => tags.toggleTag(tag.id)}
                onEdit={() => tags.startEditTag(tag)}
                onDelete={() =>
                  tags.deleteTag(tag.id, async (id) => {
                    try {
                      await deleteTag.mutateAsync(id);
                    } catch (error: unknown) {
                      showError(
                        getFriendlyErrorMessage(
                          error,
                          translate,
                          "toast.errors.validation",
                          "tag",
                        ),
                      );
                      throw error;
                    }
                  })
                }
              />
            );
          })}
          {!tags.showNewTag && !tags.atTagLimit && (
            <TouchableOpacity
              style={styles.newTagButton}
              disabled={isTagMutationPending}
              onPress={() => tags.setShowNewTag(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.newTagButtonText}>
                + {t("habits.form.newTag")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {tags.editingTagId && (
          <View style={styles.tagEditSection}>
            <TagColorPicker
              colors={tags.tagColors}
              activeColor={tags.editTagColor}
              onSelect={tags.setEditTagColor}
              ariaLabel={(color) => t("habits.form.selectColor", { color })}
              styles={styles}
            />
            <TagEditorRow
              value={tags.editTagName}
              inputAriaLabel={t("habits.form.tagName")}
              actionLabel={t("common.save")}
              cancelAriaLabel={t("common.cancel")}
              disabled={isTagMutationPending}
              onChange={tags.setEditTagName}
              onCommit={() => {
                const validationErrorKey = validateTagForm(
                  tags.editTagName,
                  tags.editTagColor,
                );
                if (validationErrorKey) {
                  showError(translate(validationErrorKey));
                  return;
                }

                void tags.saveEditTag(async (id, name, color) => {
                  try {
                    await updateTag.mutateAsync({ tagId: id, name, color });
                  } catch (error: unknown) {
                    showError(
                      getFriendlyErrorMessage(
                        error,
                        translate,
                        "toast.errors.validation",
                        "tag",
                      ),
                    );
                    throw error;
                  }
                });
              }}
              onCancel={tags.cancelEditTag}
              styles={styles}
              tokens={tokens}
            />
          </View>
        )}

        {tags.showNewTag && (
          <View style={styles.tagEditSection}>
            <TagColorPicker
              colors={tags.tagColors}
              activeColor={tags.newTagColor}
              onSelect={tags.setNewTagColor}
              ariaLabel={(color) => t("habits.form.selectColor", { color })}
              styles={styles}
            />
            <TagEditorRow
              value={tags.newTagName}
              placeholder={t("habits.form.tagName")}
              inputAriaLabel={t("habits.form.tagName")}
              actionLabel={t("common.add")}
              cancelAriaLabel={t("common.cancel")}
              disabled={isTagMutationPending}
              onChange={tags.setNewTagName}
              onCommit={() => {
                const validationErrorKey = validateTagForm(
                  tags.newTagName,
                  tags.newTagColor,
                );
                if (validationErrorKey) {
                  showError(translate(validationErrorKey));
                  return;
                }

                void tags.createAndSelectTag(async (name, color) => {
                  try {
                    const result = await createTag.mutateAsync({ name, color });
                    return result.id;
                  } catch (error: unknown) {
                    showError(
                      getFriendlyErrorMessage(
                        error,
                        translate,
                        "toast.errors.validation",
                        "tag",
                      ),
                    );
                    throw error;
                  }
                });
              }}
              onCancel={() => tags.setShowNewTag(false)}
              styles={styles}
              tokens={tokens}
            />
          </View>
        )}
      </View>

      <View style={styles.moreOptionsDivider}>
        <TouchableOpacity
          style={styles.moreOptionsButton}
          onPress={toggleAdvanced}
          activeOpacity={0.7}
        >
          <View style={showAdvanced ? styles.chevronRotated : undefined}>
            <ChevronDown size={16} color={tokens.fg2} />
          </View>
          <Text style={styles.moreOptionsLabel}>
            {t("habits.form.moreOptions")}
          </Text>
          {advancedFieldCount > 0 && (
            <Text style={styles.moreOptionsBadge}>
              {t("habits.form.moreOptionsCount", { count: advancedFieldCount })}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {showAdvanced && (
        <View style={styles.advancedSection}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("habits.form.description")}</Text>
            <BufferedSheetInput
              value={watchedDescription}
              registerFlush={registerBufferedInputFlusher}
              placeholder={t("habits.form.descriptionPlaceholder")}
              placeholderTextColor={tokens.fg3}
              maxLength={2000}
              multiline
              numberOfLines={2}
              style={[styles.input, styles.textarea]}
              textAlignVertical="top"
              onCommit={(val) =>
                setValue("description", val, { shouldDirty: true })
              }
            />
          </View>

          <View style={[styles.fieldGroup, { gap: 12 }]}>
            <Text style={styles.label}>{t("habits.form.checklist")}</Text>
            <HabitChecklist
              items={watchedChecklistItems ?? []}
              editable
              onItemsChange={(items) =>
                setValue("checklistItems", items, { shouldDirty: true })
              }
            />
            <View style={{ marginTop: 4 }}>
              <ChecklistTemplates
                items={watchedChecklistItems ?? []}
                onLoad={(items) =>
                  setValue("checklistItems", items, { shouldDirty: true })
                }
              />
            </View>
          </View>

          {watchedDueTime && !isGeneral && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t("habits.form.dueEndTime")}</Text>
              <AppTimePicker
                value={watchedDueEndTime}
                placeholder={t("habits.form.scheduledReminderTimePlaceholder")}
                accessibilityLabel={t("habits.form.dueEndTime")}
                onChange={(nextValue) =>
                  setValue("dueEndTime", nextValue, { shouldDirty: true })
                }
                onClear={() =>
                  setValue("dueEndTime", "", { shouldDirty: true })
                }
              />
            </View>
          )}

          {showEndDate && (
            <View style={styles.fieldGroup}>
              {watchedEndDate ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>{t("habits.form.endDate")}</Text>
                  <View style={styles.endDateRow}>
                    <View style={styles.endDatePicker}>
                      <AppDatePicker
                        value={watchedEndDate}
                        placeholder={t("common.selectDate")}
                        onChange={(value) =>
                          setValue("endDate", value, { shouldDirty: true })
                        }
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.removeEndDateButton}
                      onPress={() =>
                        setValue("endDate", "", { shouldDirty: true })
                      }
                      activeOpacity={0.7}
                    >
                      <X size={16} color={tokens.fg3} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.hintText}>
                    {t("habits.form.endDateHint")}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={sectionStyles.addButton}
                  onPress={() =>
                    setValue("endDate", watchedDueDate || "", {
                      shouldDirty: true,
                    })
                  }
                  activeOpacity={0.7}
                >
                  <Plus size={14} color={tokens.primary} />
                  <Text style={sectionStyles.addButtonText}>
                    {t("habits.form.addEndDate")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {watchedDueTime && !isGeneral && (
            <ReminderSection
              tokens={tokens}
              reminderEnabled={watchedReminderEnabled}
              reminderTimes={reminderTimes}
              onReminderTimesChange={onReminderTimesChange}
              onToggleReminder={() =>
                handleReminderEnabledChange(!watchedReminderEnabled)
              }
              reminderLabel={reminderLabel}
            />
          )}

          {!watchedDueTime && !isGeneral && (
            <ScheduledReminderSection
              tokens={tokens}
              reminderEnabled={watchedReminderEnabled}
              scheduledReminders={watchedScheduledReminders}
              onToggleReminder={() =>
                handleReminderEnabledChange(!watchedReminderEnabled)
              }
              onSetScheduledReminders={(reminders) =>
                setValue("scheduledReminders", reminders, { shouldDirty: true })
              }
              onValidationError={showError}
            />
          )}

          {hasProAccess && (
            <GoalLinkingField
              selectedGoalIds={selectedGoalIds}
              atGoalLimit={atGoalLimit}
              onToggleGoal={onToggleGoal}
            />
          )}

          {!isGeneral && (
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() =>
                setValue("isBadHabit", !watchedIsBadHabit, {
                  shouldDirty: true,
                })
              }
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.customCheckbox,
                  watchedIsBadHabit && styles.customCheckboxChecked,
                ]}
              >
                {watchedIsBadHabit && <Check size={12} color={tokens.fgOnPrimary} />}
              </View>
              <Text style={styles.checkboxLabel}>
                {t("habits.form.badHabitLabel")}
              </Text>
            </TouchableOpacity>
          )}

          {watchedIsBadHabit && (
            <SlipAlertSection
              tokens={tokens}
              hasProAccess={hasProAccess}
              slipAlertEnabled={watchedSlipAlertEnabled}
              onToggle={() =>
                setValue("slipAlertEnabled", !watchedSlipAlertEnabled, {
                  shouldDirty: true,
                })
              }
            />
          )}

          {children}
        </View>
      )}

    </View>
  );
}
