import { useState, useMemo, useCallback } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Plus, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  HABIT_EMOJI_CATEGORIES,
  filterHabitEmojiCategories,
} from "@orbit/shared/utils";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { BottomSheetAppTextInput } from "@/components/ui/bottom-sheet-app-text-input";
import { type AppTokens, createStyles } from "./styles";

interface HabitEmojiSelectorProps {
  selectedEmoji: string;
  tokens: AppTokens;
  styles: ReturnType<typeof createStyles>;
  onSelect: (emoji: string) => void;
}

export function HabitEmojiSelector({
  selectedEmoji,
  tokens,
  styles,
  onSelect,
}: Readonly<HabitEmojiSelectorProps>) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const searchedCategories = useMemo(() => filterHabitEmojiCategories(query), [query]);
  const filteredCategories = useMemo(
    () => selectedCategoryId
      ? searchedCategories.filter((category) => category.id === selectedCategoryId)
      : searchedCategories,
    [searchedCategories, selectedCategoryId],
  );

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setQuery("");
    setSelectedCategoryId(null);
  }, []);

  function handleSelectEmoji(emoji: string) {
    onSelect(emoji);
    closePicker();
  }

  function handleSelectCategory(categoryId: string) {
    setSelectedCategoryId((current) => current === categoryId ? null : categoryId);
  }

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.emojiWell,
          pressed
            ? {
                backgroundColor: tokens.bgElevPressed,
                transform: [{ scale: 0.96 }],
              }
            : null,
        ]}
        onPress={() => setPickerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t("habits.form.emojiOpenPicker")}
      >
        {selectedEmoji ? (
          <Text style={styles.emojiWellText}>{selectedEmoji}</Text>
        ) : (
          <Plus size={22} color={tokens.fg3} strokeWidth={1.8} />
        )}
      </Pressable>

      <BottomSheetModal
        open={pickerOpen}
        onClose={closePicker}
        title={t("habits.form.emojiPickerTitle")}
        snapPoints={["82%"]}
      >
        {pickerOpen ? (
          <View style={styles.emojiSheetContent}>
            <Text style={styles.hintText}>{t("habits.form.emojiDescription")}</Text>
            <BottomSheetAppTextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("habits.form.emojiSearchPlaceholder")}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t("habits.form.emojiSearchPlaceholder")}
            />

            {selectedEmoji ? (
              <Pressable
                style={({ pressed }) => [
                  styles.emojiRemoveButton,
                  pressed ? { transform: [{ scale: 0.96 }] } : null,
                ]}
                hitSlop={{ top: 6, bottom: 6 }}
                onPress={() => handleSelectEmoji("")}
                accessibilityRole="button"
                accessibilityLabel={t("habits.form.emojiRemove")}
              >
                <X size={14} color={tokens.fg2} strokeWidth={1.8} />
                <Text style={styles.emojiRemoveButtonText}>{t("habits.form.emojiRemove")}</Text>
              </Pressable>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.emojiCategoryTabs}
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
                    <Text style={[styles.emojiCategoryTabText, selected ? styles.emojiCategoryTabTextActive : null]}>
                      {t(category.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <ScrollView style={styles.emojiModalList} showsVerticalScrollIndicator>
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
            </ScrollView>
          </View>
        ) : null}
      </BottomSheetModal>
    </>
  );
}
