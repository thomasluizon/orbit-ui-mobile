import { forwardRef } from "react";
import { View, Text } from "react-native";
import { Sparkles } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { GradientTop } from "@/components/ui/gradient-top";
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
        <GradientTop height={420} />
        <View style={styles.emptyContent}>
          <View style={styles.emptyAvatar}>
            <Sparkles size={38} color={tokens.primarySoft} strokeWidth={1.8} />
          </View>
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
