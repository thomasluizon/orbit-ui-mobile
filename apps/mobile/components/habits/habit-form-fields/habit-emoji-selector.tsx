import { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
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
  wellSize?: number;
}

export function HabitEmojiSelector({
  selectedEmoji,
  tokens,
  styles,
  onSelect,
  wellSize = 56,
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
        ]}
        onPress={() => setPickerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t("habits.form.emojiOpenPicker")}
      >
        {selectedEmoji ? (
          <Text style={[styles.emojiWellText, wellSize === 76 ? { fontSize: 34 } : null]}>{selectedEmoji}</Text>
        ) : (
          <Plus size={20} color={tokens.fg3} strokeWidth={1.8} />
        )}
      </Pressable>

      {pickerOpen ? (<Sheet
        ref={sheetRef}
        open
        onClose={hidePicker}
        title={t("habits.form.emojiPickerTitle")}
        headerAccessory={selectedEmoji ? (
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
            <View style={{ alignItems: 'center', backgroundColor: tokens.bgWell, borderRadius: 999, height: 40, justifyContent: 'center', width: 40 }}><Text style={{ fontSize: 20 }}>{selectedEmoji}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={t("habits.form.emojiRemove")} style={({ pressed }) => [{ alignItems: 'center', borderRadius: 999, height: 40, justifyContent: 'center', width: 40 }, pressed ? { transform: [{ scale: 0.96 }] } : null]} onPress={() => onSelect("")}>
              <Trash2 size={18} color={tokens.fg2} strokeWidth={1.8} />
            </Pressable>
          </View>
        ) : undefined}
      >
        <View style={styles.emojiSheetContent}>
            <Text style={styles.hintText}>{t("habits.form.emojiDescription")}</Text>
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
                          onPress={() => handleSelectEmoji(emoji)}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
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
