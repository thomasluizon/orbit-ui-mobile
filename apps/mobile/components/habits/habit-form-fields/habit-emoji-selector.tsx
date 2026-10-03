import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { useState, useMemo, useCallback } from "react";
import { View, Text, } from "react-native";
import { Plus, Trash2, X } from "@/components/ui/icons";
import { useTranslation } from "react-i18next";
import {
  HABIT_EMOJI_CATEGORIES,
  filterHabitEmojiCategories,
} from "@orbit/shared/utils";
import { Sheet, useSheetHost } from '@/components/ui/sheet';
import { BottomSheetAppTextInput } from "@/components/ui/bottom-sheet-app-text-input";
import { type AppTokens, createStyles } from "./styles";

interface HabitEmojiSelectorProps {
  selectedEmoji: string;
  tokens: AppTokens;
  styles: ReturnType<typeof createStyles>;
  onSelect: (emoji: string) => void;
  isDisabled?: boolean;
  wellSize?: number;
}

export function HabitEmojiSelector({
  selectedEmoji,
  tokens,
  styles,
  onSelect,
  isDisabled = false,
  wellSize = TOUCH_TARGET_MIN,
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
        <Pressable focusInset
          style={({ pressed }) => [
            styles.emojiWell,
            { width: Math.max(wellSize, TOUCH_TARGET_MIN), height: Math.max(wellSize, TOUCH_TARGET_MIN), borderRadius: 12, overflow: 'hidden' },
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
      </View>

      {pickerOpen ? (<Sheet
        ref={sheetRef}
        open
        onClose={hidePicker}
        title={t("habits.form.emojiPickerTitle")}
        headerAccessory={selectedEmoji ? (
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
            <View style={{ alignItems: 'center', backgroundColor: tokens.bgWell, borderRadius: 999, height: 44, justifyContent: 'center', width: 44 }}><Text style={{ fontSize: 20 }}>{selectedEmoji}</Text></View>
            <Pressable focusInset accessibilityRole="button" accessibilityLabel={t("habits.form.emojiRemove")} accessibilityState={{ disabled: isDisabled }} disabled={isDisabled} style={({ pressed }) => [{ alignItems: 'center', borderRadius: 999, overflow: 'hidden', height: TOUCH_TARGET_MIN, justifyContent: 'center', width: TOUCH_TARGET_MIN }, pressed ? { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] } : null, isDisabled ? { opacity: 0.45 } : null]} onPress={() => onSelect("")}>
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
                <Pressable focusInset
                  accessibilityRole="button"
                  accessibilityLabel={t("habits.form.emojiClearSearch")}
                  style={({ pressed }) => [{ width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, pressed && { backgroundColor: tokens.bgHover }]}
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
                  <Pressable focusInset
                    key={category.id}
                    style={({ pressed }) => [
                      styles.emojiCategoryTab,
                      selected ? styles.emojiCategoryTabActive : null,
                      pressed ? { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] } : null,
                    ]}

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

            <View>
              {filteredCategories.length === 0 ? (
                <Text style={styles.emojiEmptyText}>{t("habits.form.emojiPickerEmpty")}</Text>
              ) : filteredCategories.map((category) => (
                <View key={category.id} style={styles.emojiCategorySection}>
                  <Text style={styles.emojiCategoryTitle}>{t(category.labelKey)}</Text>
                  <View style={styles.emojiGrid} accessibilityRole="list" accessibilityLabel={t(category.labelKey)}>
                    {category.emojis.map((emoji) => {
                      const selected = selectedEmoji === emoji;
                      return (
                        <Pressable focusInset
                          key={`${category.id}-${emoji}`}
                          style={({ pressed }) => [
                            styles.emojiOption,
                            selected ? styles.emojiOptionSelected : null,
                            pressed ? { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] } : null,
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
