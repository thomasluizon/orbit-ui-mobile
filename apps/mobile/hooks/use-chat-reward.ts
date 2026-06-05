import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { API } from "@orbit/shared/api";
import { profileKeys } from "@orbit/shared/query";
import type { Profile } from "@orbit/shared/types/profile";
import { useAdMob } from "@/hooks/use-ad-mob";
import { apiClient } from "@/lib/api-client";

interface AdRewardResponse {
  bonusMessagesGranted: number;
  newLimit: number;
}

interface UseChatRewardOptions {
  onBeforeWatch?: () => void;
}

/**
 * Mobile-only rewarded-ad flow for the chat composer: shows an AdMob rewarded
 * ad and, on completion, claims bonus AI messages from the backend and patches
 * the cached profile limit. No web counterpart — ads are mobile-only.
 */
export function useChatReward({ onBeforeWatch }: UseChatRewardOptions = {}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    isInitialized: adMobReady,
    canClaimReward,
    rewardsClaimedToday,
    dailyRewardCap,
    shouldShowAds,
    showRewardedAd,
    markRewardClaimed,
  } = useAdMob();

  const [isLoadingReward, setIsLoadingReward] = useState(false);
  const [rewardMessage, setRewardMessage] = useState<string | null>(null);

  const adsEnabledForUser = shouldShowAds();
  const canWatchRewardAd =
    adsEnabledForUser && adMobReady && canClaimReward && !isLoadingReward;

  const watchAdForMessages = useCallback(async () => {
    if (!canWatchRewardAd) {
      return;
    }

    setIsLoadingReward(true);
    setRewardMessage(null);
    onBeforeWatch?.();

    try {
      const rewardEarned = await showRewardedAd();
      if (!rewardEarned) {
        setRewardMessage(t("ads.rewardFailed"));
        return;
      }

      const response = await apiClient<AdRewardResponse>(API.subscription.adReward, {
        method: "POST",
      });

      markRewardClaimed();
      queryClient.setQueryData<Profile>(profileKeys.detail(), (current) =>
        current
          ? {
              ...current,
              aiMessagesLimit: response.newLimit,
            }
          : current,
      );
      setRewardMessage(t("ads.rewardGranted"));
    } catch {
      setRewardMessage(t("ads.rewardFailed"));
    } finally {
      setIsLoadingReward(false);
    }
  }, [canWatchRewardAd, markRewardClaimed, onBeforeWatch, queryClient, showRewardedAd, t]);

  return {
    adsEnabledForUser,
    canWatchRewardAd,
    isLoadingReward,
    rewardsClaimedToday,
    dailyRewardCap,
    rewardMessage,
    watchAdForMessages,
  };
}
