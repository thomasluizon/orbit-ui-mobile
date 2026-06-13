import { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
} from "react-native";
import { Plus, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  HABIT_EMOJI_CATEGORIES,
  filterHabitEmojiCategories,
} from "@orbit/shared/utils";
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

      {pickerOpen ? (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={closePicker}
        >
          <Pressable
            style={styles.emojiModalBackdrop}
            onPress={closePicker}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Pressable
              style={styles.emojiModalSheet}
              onPress={(event) => event.stopPropagation()}
              importantForAccessibility="no"
            >
              <View style={styles.emojiModalHeader}>
                <View style={styles.emojiModalTitleRow}>
                  <View style={styles.emojiPreviewCompact}>
                    {selectedEmoji ? (
                      <Text style={styles.emojiPreviewCompactText}>{selectedEmoji}</Text>
                    ) : (
                      <Plus size={16} color={tokens.fg3} strokeWidth={1.8} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.emojiModalTitle}>{t("habits.form.emojiPickerTitle")}</Text>
                    <Text style={styles.hintText}>{t("habits.form.emojiDescription")}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.emojiCloseButton}
                  onPress={closePicker}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.close")}
                >
                  <X size={20} color={tokens.fg2} strokeWidth={1.8} />
                </TouchableOpacity>
              </View>

              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t("habits.form.emojiSearchPlaceholder")}
                placeholderTextColor={tokens.fg3}
                style={styles.emojiSearchInput}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t("habits.form.emojiSearchPlaceholder")}
              />

              {selectedEmoji ? (
                <TouchableOpacity
                  style={styles.emojiRemoveButton}
                  onPress={() => handleSelectEmoji("")}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={t("habits.form.emojiRemove")}
                >
                  <X size={14} color={tokens.fg2} strokeWidth={1.8} />
                  <Text style={styles.emojiRemoveButtonText}>{t("habits.form.emojiRemove")}</Text>
                </TouchableOpacity>
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
                    <TouchableOpacity
                      key={category.id}
                      style={[styles.emojiCategoryTab, selected ? styles.emojiCategoryTabActive : null]}
                      onPress={() => handleSelectCategory(category.id)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={t(category.labelKey)}
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.emojiCategoryTabText, selected ? styles.emojiCategoryTabTextActive : null]}>
                        {t(category.labelKey)}
                      </Text>
                    </TouchableOpacity>
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
                          <TouchableOpacity
                            key={`${category.id}-${emoji}`}
                            style={[styles.emojiOption, selected ? styles.emojiOptionSelected : null]}
                            onPress={() => handleSelectEmoji(emoji)}
                            activeOpacity={0.75}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={`${t("habits.form.emoji")}: ${emoji}`}
                          >
                            <Text style={[styles.emojiOptionText, { color: tokens.fg1 }]}>{emoji}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}
