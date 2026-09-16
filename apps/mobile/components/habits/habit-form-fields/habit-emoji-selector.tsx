import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { useState, useMemo, useCallback } from "react";
import { ActivityIndicator, View, Text, } from "react-native";
import { Plus, Trash2, X } from "@/components/ui/icons";
import { useTranslation } from "react-i18next";
import {
  HABIT_EMOJI_CATEGORIES,
  filterHabitEmojiCategories,
} from "@orbit/shared/utils";
import { Sheet, useSheetHost } from '@/components/ui/sheet';
import { BottomSheetAppTextInput } from "@/components/ui/bottom-sheet-app-text-input";
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { type AppTokens, createStyles } from "./styles";

interface HabitEmojiSelectorProps {
  selectedEmoji: string;
  tokens: AppTokens;
  styles: ReturnType<typeof createStyles>;
  onSelect: (emoji: string) => void;
  onSuggest?: () => void;
  canSuggest?: boolean;
  isSuggesting?: boolean;
  isDisabled?: boolean;
  wellSize?: number;
}

interface EmojiSuggestButtonProps {
  canSuggest: boolean;
  isSuggesting: boolean;
  isDisabled: boolean;
  label: string;
  hint?: string;
  onSuggest?: () => void;
  styles: ReturnType<typeof createStyles>;
  tokens: AppTokens;
}

function EmojiSuggestButton({
  canSuggest,
  isSuggesting,
  isDisabled,
  label,
  hint,
  onSuggest,
  styles,
  tokens,
}: Readonly<EmojiSuggestButtonProps>) {
  if (!onSuggest) return null;
  const disabled = isSuggesting || isDisabled || !canSuggest;
  return (
    <Pressable
      testID="habit-suggest-emoji"
      style={({ pressed }) => [
        styles.emojiSuggestButton,
        disabled ? styles.emojiSuggestButtonDisabled : null,
        pressed ? { transform: [{ scale: 0.96 }] } : null,
      ]}
      onPress={onSuggest}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled, busy: isSuggesting }}
    >
      {isSuggesting ? (
        <ActivityIndicator size="small" color={tokens.primary} />
      ) : (
        <AstraGlyph size={20} color={tokens.primary} />
      )}
    </Pressable>
  );
}

export function HabitEmojiSelector({
  selectedEmoji,
  tokens,
  styles,
  onSelect,
  onSuggest,
  canSuggest = false,
  isSuggesting = false,
  isDisabled = false,
  wellSize = 46,
}: Readonly<HabitEmojiSelectorProps>) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { sheetRef, closeSheet } = useSheetHost();
  const [query, setQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const searchedCategories = useMemo(() => filterHabitEmojiCategories(query), [query]);
  const filteredCategories = useMemo(
    () => selectedCategoryId
      ? searchedCategories.filter((category) => category.id === selectedCategoryId)
      : searchedCategories,
    [searchedCategories, selectedCategoryId],
  );

  const hidePicker = useCallback(() => {
    setPickerOpen(false);
    setQuery("");
    setSelectedCategoryId(null);
  }, []);

  function handleSelectEmoji(emoji: string) {
    if (isDisabled) return;
    closeSheet(() => {
      hidePicker();
      onSelect(emoji);
    });
  }

  function handleSelectCategory(categoryId: string) {
    setSelectedCategoryId((current) => current === categoryId ? null : categoryId);
  }

  return (
    <>
      <View style={styles.emojiField}>
        {/* eslint-disable-next-line local/max-button-words -- #74 owns this existing control copy. */}
        <Pressable
          style={({ pressed }) => [
            styles.emojiWell,
            { width: wellSize, height: wellSize, borderRadius: 999 },
            pressed
              ? {
                  backgroundColor: tokens.bgHover,
                  transform: [{ scale: 0.96 }],
                }
              : null,
            isDisabled ? { opacity: 0.45 } : null,
          ]}
          disabled={isDisabled}
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("habits.form.emojiOpenPicker")}
          accessibilityState={{ disabled: isDisabled }}
        >
          {selectedEmoji ? (
            <Text style={[styles.emojiWellText, wellSize === 76 ? { fontSize: 34 } : null]}>{selectedEmoji}</Text>
          ) : (
            <Plus size={20} color={tokens.fg3} strokeWidth={1.8} />
          )}
        </Pressable>
        <EmojiSuggestButton
          canSuggest={canSuggest}
          isSuggesting={isSuggesting}
          isDisabled={isDisabled}
          label={t(isSuggesting ? "habits.form.emojiSuggesting" : "habits.form.emojiSuggest")}
          hint={!canSuggest ? t("habits.form.titleRequired") : undefined}
          onSuggest={onSuggest}
          styles={styles}
          tokens={tokens}
        />
      </View>

      {pickerOpen ? (<Sheet
        ref={sheetRef}
        open
        onClose={hidePicker}
        title={t("habits.form.emojiPickerTitle")}
        headerAccessory={selectedEmoji ? (
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
            <View style={{ alignItems: 'center', backgroundColor: tokens.bgWell, borderRadius: 999, height: 44, justifyContent: 'center', width: 44 }}><Text style={{ fontSize: 20 }}>{selectedEmoji}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={t("habits.form.emojiRemove")} accessibilityState={{ disabled: isDisabled }} disabled={isDisabled} style={({ pressed }) => [{ alignItems: 'center', borderRadius: 999, height: 44, justifyContent: 'center', width: 44 }, pressed ? { transform: [{ scale: 0.96 }] } : null, isDisabled ? { opacity: 0.45 } : null]} onPress={() => onSelect("")}>
              <Trash2 size={20} color={tokens.fg2} strokeWidth={1.8} />
            </Pressable>
          </View>
        ) : undefined}
      >
        <View style={styles.emojiSheetContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <BottomSheetAppTextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t("habits.form.emojiSearchPlaceholder")}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t("habits.form.emojiSearchPlaceholder")}
                style={{ flex: 1 }}
              />
              {query ? (
                /* eslint-disable-next-line local/max-button-words -- #74 owns this existing control copy. */
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("habits.form.emojiClearSearch")}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => setQuery('')}
                >
                  <X size={20} color={tokens.fg2} strokeWidth={1.8} />
                </Pressable>
              ) : null}
            </View>

            <View
              style={styles.emojiCategoryTabs}
              accessibilityLabel={t("habits.form.emojiCategories")}
            >
              {HABIT_EMOJI_CATEGORIES.map((category) => {
                const selected = selectedCategoryId === category.id;
                return (
                  <Pressable
                    key={category.id}
                    style={({ pressed }) => [
                      styles.emojiCategoryTab,
                      selected ? styles.emojiCategoryTabActive : null,
                      pressed ? { transform: [{ scale: 0.96 }] } : null,
                    ]}
                    hitSlop={{ top: 4, bottom: 4 }}
                    onPress={() => handleSelectCategory(category.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t(category.labelKey)}
                    accessibilityState={{ selected }}
                  >
                    <Text numberOfLines={1} style={[styles.emojiCategoryTabText, selected ? styles.emojiCategoryTabTextActive : null]}>
                      {t(category.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.emojiModalList}>
              {filteredCategories.length === 0 ? (
                <Text style={styles.emojiEmptyText}>{t("habits.form.emojiPickerEmpty")}</Text>
              ) : filteredCategories.map((category) => (
                <View key={category.id} style={styles.emojiCategorySection}>
                  <Text style={styles.emojiCategoryTitle}>{t(category.labelKey)}</Text>
                  <View style={styles.emojiGrid} accessibilityRole="list" accessibilityLabel={t(category.labelKey)}>
                    {category.emojis.map((emoji) => {
                      const selected = selectedEmoji === emoji;
                      return (
                        <Pressable
                          key={`${category.id}-${emoji}`}
                          style={({ pressed }) => [
                            styles.emojiOption,
                            selected ? styles.emojiOptionSelected : null,
                            pressed ? { transform: [{ scale: 0.96 }] } : null,
                          ]}
                          disabled={isDisabled}
                          onPress={() => handleSelectEmoji(emoji)}
                          accessibilityRole="button"
                          accessibilityState={{
                            selected,
                            ...(isDisabled ? { disabled: true } : {}),
                          }}
                          accessibilityLabel={`${t("habits.form.emoji")}: ${emoji}`}
                        >
                          <Text style={[styles.emojiOptionText, { color: tokens.fg1 }]}>{emoji}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
        </View>
      </Sheet>) : null}
    </>
  );
}
