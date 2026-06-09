import { forwardRef } from "react";
import { View, Text } from "react-native";
import { Sparkles } from "lucide-react-native";
import { useTranslation } from "react-i18next";
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
        <View style={styles.sparkleOuter}>
          <View style={styles.orbitRing} />
          <View style={styles.sparkleInnerRing} />
          <Sparkles size={36} color={tokens.fg1} strokeWidth={1.3} />
        </View>
        <Text style={[styles.emptyTitle, { color: tokens.fg1 }]}>
          {t("chat.empty.title")}
        </Text>
        <Text style={[styles.emptyText, { color: tokens.fg3 }]}>
          {t("chat.suggestion.prompt")}
        </Text>
        <SuggestionChips onSelect={onSelectSuggestion} />
        <Text style={[styles.aiDisclaimer, { color: tokens.fg3 }]}>
          {t("aiDisclosure.notMedicalAdvice")}
        </Text>
      </View>
    );
  },
);
