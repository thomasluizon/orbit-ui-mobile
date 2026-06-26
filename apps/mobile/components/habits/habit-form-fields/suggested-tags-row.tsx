import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Sparkles } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { SuggestedTag } from "@orbit/shared/types/habit";
import { getFriendlyErrorMessage } from "@orbit/shared/utils";
import { useAppToast } from "@/hooks/use-app-toast";
import { useSuggestTags } from "@/hooks/use-tags";
import { type AppTokens } from "./styles";
import type { HabitFormStyles } from "./types";

interface SuggestedTagsRowProps {
  title: string;
  description: string;
  atTagLimit: boolean;
  onAccept: (suggestion: SuggestedTag) => void;
  styles: HabitFormStyles;
  tokens: AppTokens;
}

export function SuggestedTagsRow({
  title,
  description,
  atTagLimit,
  onAccept,
  styles,
  tokens,
}: Readonly<SuggestedTagsRowProps>) {
  const { t, i18n } = useTranslation();
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  );
  const { showError } = useAppToast();
  const suggestMutation = useSuggestTags();
  const [suggestions, setSuggestions] = useState<SuggestedTag[]>([]);
  const [noResults, setNoResults] = useState(false);

  const trimmedTitle = title.trim();
  const canSuggest =
    trimmedTitle.length > 0 && !atTagLimit && !suggestMutation.isPending;

  async function handleSuggest() {
    if (!canSuggest) return;
    setNoResults(false);
    try {
      const response = await suggestMutation.mutateAsync({
        title: trimmedTitle,
        description: description.trim() ? description.trim() : null,
        language: i18n.language,
      });
      setSuggestions(response.tags);
      setNoResults(response.tags.length === 0);
    } catch (error: unknown) {
      showError(
        getFriendlyErrorMessage(
          error,
          translate,
          "habits.form.suggestTagsError",
          "generic",
        ),
      );
    }
  }

  function handleAccept(suggestion: SuggestedTag) {
    onAccept(suggestion);
    setSuggestions((previous) =>
      previous.filter((candidate) => candidate.name !== suggestion.name),
    );
  }

  return (
    <View style={styles.fieldGroup}>
      <View style={styles.tagsRow}>
        <TouchableOpacity
          style={[styles.newTagButton, !canSuggest && { opacity: 0.5 }]}
          disabled={!canSuggest}
          accessibilityRole="button"
          accessibilityLabel={t("habits.form.suggestTags")}
          accessibilityState={{
            disabled: !canSuggest,
            busy: suggestMutation.isPending,
          }}
          onPress={handleSuggest}
          activeOpacity={0.7}
        >
          <Sparkles size={14} color={tokens.fg2} strokeWidth={2} />
          <Text style={styles.newTagButtonText}>
            {suggestMutation.isPending
              ? t("habits.form.suggestingTags")
              : t("habits.form.suggestTags")}
          </Text>
        </TouchableOpacity>
      </View>

      {suggestions.length > 0 && (
        <>
          <Text style={styles.hintText}>
            {t("habits.form.suggestedTagsLabel")}
          </Text>
          <View style={styles.tagsRow}>
            {suggestions.map((suggestion) => (
              <TouchableOpacity
                key={`${suggestion.name}-${suggestion.id ?? "new"}`}
                style={[
                  styles.tagChip,
                  styles.tagChipInactive,
                  atTagLimit && { opacity: 0.3 },
                ]}
                disabled={atTagLimit}
                accessibilityRole="button"
                accessibilityLabel={suggestion.name}
                onPress={() => handleAccept(suggestion)}
                activeOpacity={0.7}
              >
                <View style={styles.tagChipMain}>
                  <View
                    style={[styles.tagDot, { backgroundColor: suggestion.color }]}
                  />
                  <Text style={styles.tagChipText}>{suggestion.name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {noResults && !suggestMutation.isPending && (
        <Text style={styles.hintText}>{t("habits.form.noTagSuggestions")}</Text>
      )}
    </View>
  );
}
