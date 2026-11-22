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
  restReason?: "todayOrbit.guided.offline" | "conversation.restLimit" | null;
}

/** The empty thread. A thread that rests (offline or at the message limit) gives the reason in one Orbit line under Orbit. */
export const ChatEmptyState = forwardRef<View, Readonly<ChatEmptyStateProps>>(
  function ChatEmptyState({ styles, browseAction, mascotState, restReason }, ref) {
    const { t } = useTranslation();
    return (
      <View ref={ref} style={styles.emptyState}>
        <ScrollView contentContainerStyle={styles.emptyContent} keyboardShouldPersistTaps="handled">
          <EmptyState title={t("chat.empty.title")} line={restReason ? t(restReason) : undefined} action={browseAction} mascotState={mascotState} disclosure={
            <Text style={styles.aiDisclaimer}>
              {t("aiDisclosure.notMedicalAdvice")}
            </Text>
          } />
        </ScrollView>
      </View>
    );
  },
);
