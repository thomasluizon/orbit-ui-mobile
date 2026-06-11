import { forwardRef } from "react";
import { View, Text, TouchableOpacity, Pressable, ScrollView, Image, Linking } from "react-native";
import { Crown, X, WifiOff } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeInLeft, ReduceMotion } from "react-native-reanimated";
import { InfoCard } from "@/components/ui/info-card";
import { PillButton } from "@/components/ui/pill-button";
import { ChatInputBar } from "@/components/chat/chat-input-bar";
import { OfflineUnavailableState } from "@/components/ui/offline-unavailable-state";
import type { ChatStyles, Tokens } from "@/app/chat.styles";

interface ChatRewardState {
  adsEnabledForUser: boolean;
  canWatchRewardAd: boolean;
  isLoadingReward: boolean;
  rewardsClaimedToday: number;
  dailyRewardCap: number;
  rewardMessage: string | null;
  onWatchAd: () => void;
}

interface ChatInputAreaProps {
  tokens: Tokens;
  styles: ChatStyles;
  paddingBottom: number;
  marginBottom: number;
  hasMessages: boolean;
  isOnline: boolean;
  offlineTitle: string;
  offlineDescription: string;
  sendError: string | null;
  canRetry: boolean;
  speechError: string | null;
  imagePreview: string | null;
  starterChips: readonly string[];
  hasProAccess: boolean;
  aiMessagesUsed: number;
  aiMessagesLimit: number;
  atMessageLimit: boolean;
  reward: ChatRewardState;
  voiceRef: React.Ref<View>;
  isRecording: boolean;
  isTyping: boolean;
  selectedImagePresent: boolean;
  transcript: string;
  composerResetSignal: number;
  recordingTime: string;
  speechSupported: boolean;
  speechLang: string;
  currentLangFlag: string;
  showLangPicker: boolean;
  onRemoveImage: () => void;
  onRetry: () => void;
  onSendChip: (chip: string) => void;
  onSend: (message: string) => void;
  onToggleRecording: () => void;
  onOpenFilePicker: () => void;
  onToggleLangPicker: () => void;
  onSelectLanguage: (value: string) => void;
  onUpgrade: () => void;
}

export const ChatInputArea = forwardRef<View, Readonly<ChatInputAreaProps>>(
  function ChatInputArea(props, inputAreaRef) {
    const { t } = useTranslation();
    const {
      tokens,
      styles,
      hasMessages,
      isOnline,
      offlineTitle,
      offlineDescription,
      sendError,
      canRetry,
      speechError,
      imagePreview,
      starterChips,
      hasProAccess,
      aiMessagesUsed,
      aiMessagesLimit,
      atMessageLimit,
      reward,
      voiceRef,
      onRemoveImage,
      onRetry,
      onSendChip,
      onUpgrade,
    } = props;

    return (
      <View
        ref={inputAreaRef}
        style={[
          styles.inputArea,
          {
            backgroundColor: tokens.bg,
            borderTopColor: tokens.hairline,
            paddingBottom: props.paddingBottom,
            marginBottom: props.marginBottom,
          },
        ]}
      >
        {sendError && (
          <Text style={[styles.errorText, { color: tokens.statusBad }]} accessibilityRole="alert">
            {sendError}
            {canRetry ? (
              <Text
                onPress={onRetry}
                accessibilityRole="button"
                accessibilityLabel={t("common.retry")}
                style={styles.retryText}
              >
                {"  " + t("common.retry")}
              </Text>
            ) : null}
          </Text>
        )}
        {!isOnline && (
          <OfflineUnavailableState
            title={offlineTitle}
            description={offlineDescription}
            compact
          />
        )}
        {speechError === t("speech.micDenied") && (
          <TouchableOpacity
            style={styles.permissionAction}
            onPress={() => {
              void Linking.openSettings().catch(() => {});
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.permissionActionText, { color: tokens.fg1 }]}>
              {t("common.openSettings")}
            </Text>
          </TouchableOpacity>
        )}

        {imagePreview && (
          <View style={styles.imagePreviewRow}>
            <View style={styles.imagePreviewCard}>
              <Image
                source={{ uri: imagePreview }}
                style={[styles.imagePreview, { borderColor: tokens.hairline }]}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t("chat.removeImage")}
                activeOpacity={0.8}
                onPress={onRemoveImage}
                style={[
                  styles.imageRemoveButton,
                  { backgroundColor: tokens.bgElev, borderColor: tokens.hairlineStrong },
                ]}
              >
                <X size={12} color={tokens.fg1} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {hasMessages && !isOnline ? (
          <View style={styles.offlineNotice}>
            <WifiOff size={15} color={tokens.fg3} strokeWidth={1.6} />
            <Text style={[styles.offlineText, { color: tokens.fg2 }]}>{offlineTitle}</Text>
          </View>
        ) : null}

        {hasMessages && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickChipsContent}
            style={styles.quickChipsScroll}
          >
            {starterChips.map((chip, index) => (
              <Animated.View
                key={chip}
                entering={FadeInLeft.duration(280)
                  .delay(index * 60)
                  .reduceMotion(ReduceMotion.System)}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={chip}
                  onPress={() => onSendChip(chip)}
                  style={({ pressed }) => [
                    styles.quickChip,
                    pressed && styles.quickChipPressed,
                  ]}
                  hitSlop={{ top: 4, bottom: 4 }}
                >
                  <Text style={styles.quickChipText}>{chip}</Text>
                </Pressable>
              </Animated.View>
            ))}
          </ScrollView>
        )}

        <ChatInputBar
          ref={voiceRef}
          tokens={tokens}
          styles={styles}
          isRecording={props.isRecording}
          isTyping={props.isTyping}
          isOnline={isOnline}
          atMessageLimit={atMessageLimit}
          limitLocked={!hasProAccess && atMessageLimit}
          selectedImagePresent={props.selectedImagePresent}
          transcript={props.transcript}
          composerResetSignal={props.composerResetSignal}
          recordingTime={props.recordingTime}
          speechSupported={props.speechSupported}
          speechLang={props.speechLang}
          currentLangFlag={props.currentLangFlag}
          showLangPicker={props.showLangPicker}
          onSend={props.onSend}
          onToggleRecording={props.onToggleRecording}
          onOpenFilePicker={props.onOpenFilePicker}
          onToggleLangPicker={props.onToggleLangPicker}
          onSelectLanguage={props.onSelectLanguage}
        />

        {!hasProAccess && atMessageLimit && (
          <View style={styles.limitBlock} accessibilityLiveRegion="polite">
            <InfoCard title={t("chat.limitReachedError")} />
            <PillButton
              fullWidth
              leading={<Crown size={18} strokeWidth={1.8} color={tokens.fgOnPrimary} />}
              onPress={onUpgrade}
            >
              {t("upgrade.subscribe")}
            </PillButton>
            {reward.adsEnabledForUser ? (
              <View style={styles.rewardCard}>
                <TouchableOpacity
                  style={[
                    styles.rewardButton,
                    !reward.canWatchRewardAd && styles.rewardButtonDisabled,
                  ]}
                  onPress={reward.onWatchAd}
                  disabled={!reward.canWatchRewardAd}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.rewardButtonText, { color: tokens.fg1 }]}>
                    {reward.isLoadingReward
                      ? t("common.loading")
                      : t("ads.watchForMessages")}
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.rewardMeta, { color: tokens.fg3 }]}>
                  {reward.rewardsClaimedToday}/{reward.dailyRewardCap}{" "}
                  {t("ads.dailyLimitReached")}
                </Text>
                {reward.rewardMessage ? (
                  <Text style={[styles.rewardMessage, { color: tokens.fg2 }]}>
                    {reward.rewardMessage}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
        {!hasProAccess && !atMessageLimit && (
          <Text style={[styles.usageText, { color: tokens.fg3 }]}>
            {aiMessagesUsed}/{aiMessagesLimit} {t("chat.messagesUsed")}
          </Text>
        )}
      </View>
    );
  },
);
