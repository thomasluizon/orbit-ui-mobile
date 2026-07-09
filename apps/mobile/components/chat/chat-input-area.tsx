import { forwardRef } from "react";
import { View, Text, TouchableOpacity, Pressable, ScrollView, Image, Linking } from "react-native";
import { Crown, FileText, X, WifiOff } from "lucide-react-native";
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
  isTranscribing: boolean;
  isTyping: boolean;
  selectedImagePresent: boolean;
  selectedTextFileName: string | null;
  selectedTextFilePresent: boolean;
  transcript: string;
  composerResetSignal: number;
  recordingTime: string;
  speechSupported: boolean;
  onRemoveImage: () => void;
  onRemoveTextFile: () => void;
  onRetry: () => void;
  onSendChip: (chip: string) => void;
  onSend: (message: string) => void;
  onToggleRecording: () => void;
  onOpenFilePicker: () => void;
  onOpenTextFilePicker: () => void;
  onUpgrade: () => void;
}

interface ChatInputNoticesProps {
  tokens: Tokens;
  styles: ChatStyles;
  hasMessages: boolean;
  isOnline: boolean;
  offlineTitle: string;
  offlineDescription: string;
  sendError: string | null;
  canRetry: boolean;
  speechError: string | null;
  imagePreview: string | null;
  selectedTextFileName: string | null;
  onRetry: () => void;
  onRemoveImage: () => void;
  onRemoveTextFile: () => void;
}

function ChatInputNotices({
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
  selectedTextFileName,
  onRetry,
  onRemoveImage,
  onRemoveTextFile,
}: Readonly<ChatInputNoticesProps>) {
  const { t } = useTranslation();
  return (
    <>
      {sendError && (
        <Text style={[styles.errorText, { color: tokens.statusBadText }]} accessibilityRole="alert">
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
      {speechError && (
        <Text
          style={[styles.errorText, { color: tokens.statusBadText }]}
          accessibilityRole="alert"
        >
          {speechError}
        </Text>
      )}
      {speechError === t("speech.micDenied") && (
        <TouchableOpacity
          style={styles.permissionAction}
          onPress={() => {
            void Linking.openSettings().catch(() => {});
          }}
          activeOpacity={0.75}
          hitSlop={{ top: 5, bottom: 5 }}
          accessibilityRole="button"
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
              resizeMethod="resize"
              style={[styles.imagePreview, { borderColor: tokens.hairline }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("chat.removeImage")}
              hitSlop={12}
              onPress={onRemoveImage}
              style={({ pressed }) => [
                styles.imageRemoveButton,
                { backgroundColor: tokens.bgElev, borderColor: tokens.hairlineStrong },
                pressed && styles.iconPressed,
              ]}
            >
              <X size={12} color={tokens.fg1} />
            </Pressable>
          </View>
        </View>
      )}

      {selectedTextFileName && (
        <View style={styles.textFileChipRow}>
          <View style={styles.textFileChip}>
            <FileText size={16} color={tokens.primary} strokeWidth={1.8} />
            <Text style={styles.textFileChipText} numberOfLines={1}>
              {selectedTextFileName}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("chat.removeFile")}
              hitSlop={12}
              onPress={onRemoveTextFile}
              style={({ pressed }) => [
                styles.textFileChipRemove,
                pressed && styles.iconPressed,
              ]}
            >
              <X size={12} color={tokens.fg1} />
            </Pressable>
          </View>
        </View>
      )}

      {hasMessages && !isOnline ? (
        <View style={styles.offlineNotice}>
          <WifiOff size={15} color={tokens.fg3} strokeWidth={1.6} />
          <Text style={[styles.offlineText, { color: tokens.fg2 }]}>{offlineTitle}</Text>
        </View>
      ) : null}
    </>
  );
}

interface ChatStarterChipsProps {
  styles: ChatStyles;
  starterChips: readonly string[];
  onSendChip: (chip: string) => void;
}

function ChatStarterChips({ styles, starterChips, onSendChip }: Readonly<ChatStarterChipsProps>) {
  return (
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
          >
            <Text style={styles.quickChipText}>{chip}</Text>
          </Pressable>
        </Animated.View>
      ))}
    </ScrollView>
  );
}

interface ChatLimitNoticeProps {
  tokens: Tokens;
  styles: ChatStyles;
  reward: ChatRewardState;
  onUpgrade: () => void;
}

function ChatLimitNotice({ tokens, styles, reward, onUpgrade }: Readonly<ChatLimitNoticeProps>) {
  const { t } = useTranslation();
  return (
    <View style={styles.limitBlock} accessibilityLiveRegion="polite">
      <InfoCard title={t("chat.limitReachedError")} />
      <PillButton
        // eslint-disable-next-line local/no-fullbleed-button -- chat composer upsell notice CTA
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
            hitSlop={{ top: 5, bottom: 5 }}
            accessibilityRole="button"
            accessibilityState={{ disabled: !reward.canWatchRewardAd }}
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
  );
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
      selectedTextFileName,
      starterChips,
      hasProAccess,
      aiMessagesUsed,
      aiMessagesLimit,
      atMessageLimit,
      reward,
      voiceRef,
      onRemoveImage,
      onRemoveTextFile,
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
        <ChatInputNotices
          tokens={tokens}
          styles={styles}
          hasMessages={hasMessages}
          isOnline={isOnline}
          offlineTitle={offlineTitle}
          offlineDescription={offlineDescription}
          sendError={sendError}
          canRetry={canRetry}
          speechError={speechError}
          imagePreview={imagePreview}
          selectedTextFileName={selectedTextFileName}
          onRetry={onRetry}
          onRemoveImage={onRemoveImage}
          onRemoveTextFile={onRemoveTextFile}
        />

        {hasMessages && (
          <ChatStarterChips
            styles={styles}
            starterChips={starterChips}
            onSendChip={onSendChip}
          />
        )}

        <ChatInputBar
          ref={voiceRef}
          tokens={tokens}
          styles={styles}
          isRecording={props.isRecording}
          isTranscribing={props.isTranscribing}
          isTyping={props.isTyping}
          isOnline={isOnline}
          atMessageLimit={atMessageLimit}
          limitLocked={!hasProAccess && atMessageLimit}
          selectedImagePresent={props.selectedImagePresent}
          selectedTextFilePresent={props.selectedTextFilePresent}
          transcript={props.transcript}
          composerResetSignal={props.composerResetSignal}
          recordingTime={props.recordingTime}
          speechSupported={props.speechSupported}
          onSend={props.onSend}
          onToggleRecording={props.onToggleRecording}
          onOpenFilePicker={props.onOpenFilePicker}
          onOpenTextFilePicker={props.onOpenTextFilePicker}
        />

        {!hasProAccess && atMessageLimit && (
          <ChatLimitNotice
            tokens={tokens}
            styles={styles}
            reward={reward}
            onUpgrade={onUpgrade}
          />
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
