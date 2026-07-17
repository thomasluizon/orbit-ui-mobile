import { forwardRef } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { AstraAvatar } from "@/components/ui/astra-avatar";
import { SuggestionChips } from "@/components/chat/suggestion-chips";
import type { ChatStyles } from "@/app/chat.styles";

interface ChatEmptyStateProps {
  styles: ChatStyles;
  onSelectSuggestion: (suggestion: string) => void;
}

export const ChatEmptyState = forwardRef<View, Readonly<ChatEmptyStateProps>>(
  function ChatEmptyState({ styles, onSelectSuggestion }, ref) {
    const { t } = useTranslation();

    return (
      <View ref={ref} style={styles.emptyState}>
        <View style={styles.emptyContent}>
          <AstraAvatar size={84} animate />
          <Text style={styles.emptyTitle}>{t("chat.empty.title")}</Text>
          <Text style={styles.emptyText}>{t("chat.suggestion.prompt")}</Text>
          <SuggestionChips onSelect={onSelectSuggestion} />
          <Text style={styles.aiDisclaimer}>
            {t("aiDisclosure.notMedicalAdvice")}
          </Text>
        </View>
      </View>
    );
  },
);
