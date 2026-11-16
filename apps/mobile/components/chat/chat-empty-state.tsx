import { forwardRef, type ReactElement } from "react";
import { ScrollView, View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import type { EmptyStateProps } from "@orbit/shared/contracts/feedback";
import { EmptyState } from "@/components/ui/empty-state";
import type { ChatStyles } from "@/components/chat/conversation.styles";

interface ChatEmptyStateProps {
  styles: ChatStyles;
  browseAction?: ReactElement;
  mascotState?: EmptyStateProps["mascotState"];
}

export const ChatEmptyState = forwardRef<View, Readonly<ChatEmptyStateProps>>(
  function ChatEmptyState({ styles, browseAction, mascotState }, ref) {
    const { t } = useTranslation();
    return (
      <View ref={ref} style={styles.emptyState}>
        <ScrollView contentContainerStyle={styles.emptyContent} keyboardShouldPersistTaps="handled">
          <EmptyState title={t("chat.empty.title")} action={browseAction} mascotState={mascotState} disclosure={
            <Text style={styles.aiDisclaimer}>
              {t("aiDisclosure.notMedicalAdvice")}
            </Text>
          } />
        </ScrollView>
      </View>
    );
  },
);
