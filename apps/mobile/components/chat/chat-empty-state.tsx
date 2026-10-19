import { forwardRef, type ReactElement } from "react";
import { ScrollView, View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import type { ChatStyles } from "@/components/chat/conversation.styles";

interface ChatEmptyStateProps {
  styles: ChatStyles;
  browseAction?: ReactElement;
}

export const ChatEmptyState = forwardRef<View, Readonly<ChatEmptyStateProps>>(
  function ChatEmptyState({ styles, browseAction }, ref) {
    const { t } = useTranslation();
    return (
      <View ref={ref} style={styles.emptyState}>
        <ScrollView contentContainerStyle={styles.emptyContent} keyboardShouldPersistTaps="handled">
          <EmptyState mark="astra" title={t("chat.empty.title")} action={browseAction} />
          <Text style={styles.aiDisclaimer}>
            {t("aiDisclosure.notMedicalAdvice")}
          </Text>
        </ScrollView>
      </View>
    );
  },
);
