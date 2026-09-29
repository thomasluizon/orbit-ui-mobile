import { forwardRef } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import { SuggestionChips } from "@/components/chat/suggestion-chips";
import type { ChatStyles } from "@/components/chat/conversation.styles";

interface ChatEmptyStateProps {
  styles: ChatStyles;
  onSelectSuggestion: (suggestion: string) => void;
  contextualAction?: { label: string; onSelect: () => void };
}

/** The first thing a person sees in an empty thread: the Astra mark and title,
 *  the prompt over the suggestions, and the line saying what Astra is not. */
export const ChatEmptyState = forwardRef<View, Readonly<ChatEmptyStateProps>>(
  function ChatEmptyState({ styles, onSelectSuggestion, contextualAction }, ref) {
    const { t } = useTranslation();

    return (
      <View ref={ref} style={styles.emptyState}>
        <View style={styles.emptyContent}>
          <EmptyState mark="astra" title={t("chat.empty.title")} />
          <View style={styles.emptySuggestions}>
            <Text style={styles.emptyPrompt}>{t("chat.suggestion.prompt")}</Text>
            <SuggestionChips onSelect={onSelectSuggestion} contextualAction={contextualAction} />
          </View>
          <Text style={styles.aiDisclaimer}>
            {t("aiDisclosure.notMedicalAdvice")}
          </Text>
        </View>
      </View>
    );
  },
);
