import { forwardRef } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { AnimatedSparkle } from "@/components/chat/chat-animations";
import { SuggestionChips } from "@/components/chat/suggestion-chips";
import type { ChatStyles, Tokens } from "@/app/chat.styles";

interface ChatEmptyStateProps {
  tokens: Tokens;
  styles: ChatStyles;
  onSelectSuggestion: (suggestion: string) => void;
}

export const ChatEmptyState = forwardRef<View, Readonly<ChatEmptyStateProps>>(
  function ChatEmptyState({ tokens, styles, onSelectSuggestion }, ref) {
    const { t } = useTranslation();

    return (
      <View ref={ref} style={styles.emptyState}>
        <AnimatedSparkle primaryColor={tokens.fg1} styles={styles} />
        <Text style={[styles.emptyText, { color: tokens.fg2 }]}>
          {t("chat.suggestion.prompt")}
        </Text>
        <SuggestionChips onSelect={onSelectSuggestion} />
      </View>
    );
  },
);
