import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { View } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useWatch } from "react-hook-form";
import type { TagSelectionState } from "@/hooks/use-tag-selection";
import type { HabitFormHelpers } from "@/hooks/use-habit-form";
import { useAppToast } from "@/hooks/use-app-toast";
import { useHasProAccess } from "@/hooks/use-profile";
import { createTokensV2 } from '@/lib/theme';
import { useAppTheme } from "@/lib/use-app-theme";
import {
  createSectionStyles,
  createStyles,
} from "./habit-form-fields/styles";
import { HabitEmojiSelector } from "./habit-form-fields/habit-emoji-selector";
import { TitleSection } from "./habit-form-fields/title-section";
import { FrequencyTypeCards } from "./habit-form-fields/frequency-type-cards";
import { FrequencyDetailSection } from "./habit-form-fields/frequency-detail-section";
import { ActiveDaysSection } from "./habit-form-fields/active-days-section";
import { DueDateSection } from "./habit-form-fields/due-date-section";
import { TagsSection } from "./habit-form-fields/tags-section";
import { MoreOptionsToggle } from "./habit-form-fields/more-options-toggle";
import { AdvancedSection } from "./habit-form-fields/advanced-section";

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
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const { showError } = useAppToast();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const sectionStyles = useMemo(() => createSectionStyles(tokens), [tokens]);
  const hasProAccess = useHasProAccess();

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

  const watchedEmoji = useWatch({ control: form.control, name: "emoji" }) ?? "";
  const watchedTitle = useWatch({ control: form.control, name: "title" }) ?? "";
  const watchedDescription =
    useWatch({ control: form.control, name: "description" }) ?? "";

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
    setShowAdvanced((prev) => !prev);
  }

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
      <TitleSection
        control={form.control}
        error={errors.title?.message}
        registerFlush={registerBufferedInputFlusher}
        onCommit={(val) => setValue("title", val, { shouldDirty: true })}
        onDraftChange={(val) => setValue("title", val, { shouldDirty: true })}
        leading={
          <HabitEmojiSelector
            selectedEmoji={watchedEmoji}
            tokens={tokens}
            styles={styles}
            onSelect={(emoji) => setValue("emoji", emoji, { shouldDirty: true })}
          />
        }
        styles={styles}
      />

      <FrequencyTypeCards
        isOneTime={isOneTime}
        isGeneral={isGeneral}
        isFlexible={isFlexible}
        onSetOneTime={setOneTime}
        onSetRecurring={setRecurring}
        onSetFlexible={setFlexible}
        onSetGeneral={setGeneral}
        styles={styles}
        tokens={tokens}
      />

      <FrequencyDetailSection
        control={form.control}
        isOneTime={isOneTime}
        isGeneral={isGeneral}
        isFlexible={isFlexible}
        frequencyUnits={frequencyUnits}
        onQuantityChange={(value) =>
          setValue("frequencyQuantity", value, { shouldDirty: true })
        }
        onUnitChange={(value) =>
          setValue("frequencyUnit", value, { shouldDirty: true })
        }
        styles={styles}
      />

      {showDayPicker && !isGeneral && (
        <ActiveDaysSection
          control={form.control}
          daysList={daysList}
          onToggleDay={toggleDay}
          styles={styles}
        />
      )}

      {!isGeneral && (
        <DueDateSection
          control={form.control}
          onDueDateChange={(value) =>
            setValue("dueDate", value, { shouldDirty: true })
          }
          onDueTimeChange={(value) =>
            setValue("dueTime", value, { shouldDirty: true })
          }
          onClearDueTime={() => {
            setValue("dueTime", "", { shouldDirty: true });
            setValue("dueEndTime", "", { shouldDirty: true });
          }}
          styles={styles}
        />
      )}

      <TagsSection
        tags={tags}
        title={watchedTitle}
        description={watchedDescription}
        styles={styles}
        tokens={tokens}
      />

      <MoreOptionsToggle
        control={form.control}
        selectedGoalIds={selectedGoalIds}
        expanded={showAdvanced}
        onToggle={toggleAdvanced}
        styles={styles}
        tokens={tokens}
      />

      {showAdvanced && (
        <Animated.View
          entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)}
        >
          <AdvancedSection
            control={form.control}
            isGeneral={isGeneral}
            showEndDate={showEndDate}
            hasProAccess={hasProAccess}
            reminderTimes={reminderTimes}
            onReminderTimesChange={onReminderTimesChange}
            onToggleReminder={handleReminderEnabledChange}
            onValidationError={showError}
            selectedGoalIds={selectedGoalIds}
            atGoalLimit={atGoalLimit}
            onToggleGoal={onToggleGoal}
            registerFlush={registerBufferedInputFlusher}
            setValue={setValue}
            styles={styles}
            sectionStyles={sectionStyles}
            tokens={tokens}
          >
            {children}
          </AdvancedSection>
        </Animated.View>
      )}

    </View>
  );
}
