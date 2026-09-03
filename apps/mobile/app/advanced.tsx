import { useState, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { enUS, ptBR } from 'date-fns/locale'
import { Lock, Smartphone } from '@/components/ui/icons'
import { useQueryClient } from '@tanstack/react-query'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { CreateApiKeyModal } from '@/components/ui/create-api-key-modal'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { ProBadge } from '@/components/ui/pro-badge'

import { useApiKeyManagement } from './advanced-api-keys'
import {
  ApiKeysSection,
  McpConnectionInstructions,
  WidgetInfoSheet,
} from '@/components/profile/advanced-sections'
import { styles, type Tokens } from './advanced-styles'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { StepUp } from '@/components/ui/step-up'
import { API } from '@orbit/shared/api'
import { stepUpMessageResponseSchema } from '@orbit/shared/types/step-up'
import { apiClient } from '@/lib/api-client'
import { beginStepUpChallenge } from '@/lib/step-up-storage'

function sectionEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(index * 50)
    .reduceMotion(ReduceMotion.System)
}

function McpUpgradeChip({
  onPress,
  label,
  tokens,
}: Readonly<{ onPress: () => void; label: string; tokens: Tokens }>) {
  return (
    <View style={localStyles.upgradeRow}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.createKeyChip,
          {
            backgroundColor: tokens.selectionBg,
            borderColor: tintFromPrimary(tokens, 0.45),
          },
          pressed ? styles.actionChipPressed : null,
        ]}
        hitSlop={8}
      >
        <Lock size={14} color={tokens.primary} strokeWidth={1.8} />
        <Text style={[styles.actionLink, { color: tokens.fg1 }]}>
          {label}
        </Text>
      </Pressable>
    </View>
  )
}

export default function AdvancedScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const params = useLocalSearchParams<{ 'create-key'?: string | string[] }>()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile } = useProfile()
  const queryClient = useQueryClient()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const dateFnsLocale = i18n.language === 'pt-BR' ? ptBR : enUS
  const { isOnline } = useOffline()

  const [showWidgetInfo, setShowWidgetInfo] = useState(false)
  const [showApiKeyStepUp, setShowApiKeyStepUp] = useState(false)
  const [apiKeyStepUpBusy, setApiKeyStepUpBusy] = useState(false)
  const [apiKeyStepUpError, setApiKeyStepUpError] = useState(false)
  const createKeyParam = Array.isArray(params['create-key'])
    ? params['create-key'][0]
    : params['create-key']

  const {
    apiKeysQuery,
    capabilitiesQuery,
    apiKeys,
    scopeOptions,
    canCreateKey,
    canCreateScopedKey,
    createKeyModalOpen,
    setCreateKeyModalOpen,
    createKeyError,
    revokingKeyId,
    setRevokingKeyId,
    revokeKeyMutation,
    handleCreateKey,
  } = useApiKeyManagement({
    hasProAccess: profile?.hasProAccess ?? false,
    initialCreateKeyModalOpen: createKeyParam === '1',
    isOnline,
    queryClient,
    t,
  })

  async function startApiKeyStepUp() {
    setApiKeyStepUpBusy(true)
    setApiKeyStepUpError(false)
    try {
      await apiClient(
        API.apiKeys.requestCreationChallenge,
        { method: 'POST' },
        stepUpMessageResponseSchema,
      )
      await beginStepUpChallenge('keys')
      router.push('/step-up?operation=keys')
    } catch {
      setApiKeyStepUpError(true)
      setApiKeyStepUpBusy(false)
    }
  }

  function formatKeyDate(dateStr: string): string {
    return formatDistanceToNow(parseISO(dateStr), {
      addSuffix: true,
      locale: dateFnsLocale,
    })
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar
        back
        onBack={() => goBackOrFallback('/profile')}
        title={t('advancedSettings.title')}
        backLabel={t('common.backToProfile')}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={sectionEntrance(0)}>
          <SectionLabel>{t('advancedSettings.widgetSection')}</SectionLabel>
          <SettingsRow
            label={t('profile.widgetTitle')}
            desc={t('profile.widgetHint')}
            icon={Smartphone}
            onPress={() => setShowWidgetInfo(true)}
            accessory="chevron"
            divider={false}
          />
        </Animated.View>

        <Animated.View entering={sectionEntrance(1)}>
          <SectionLabel trailing={<ProBadge />}>{t('orbitMcp.title')}</SectionLabel>

          <View style={localStyles.mcpIntro}>
            {!profile?.hasProAccess ? (
              <McpUpgradeChip
                onPress={() => router.push(buildUpgradeHref('/advanced'))}
                label={t('common.proBadge')}
                tokens={tokens}
              />
            ) : null}
            <Text style={[localStyles.mcpDescription, { color: tokens.fg3 }]}>
              {t('orbitMcp.description')}
            </Text>
          </View>

          {profile?.hasProAccess ? (
            <>
              <ApiKeysSection
                apiKeysQuery={apiKeysQuery}
                capabilitiesQuery={capabilitiesQuery}
                apiKeys={apiKeys}
                canCreateKey={canCreateKey}
                canCreateScopedKey={canCreateScopedKey}
                onCreateKey={() => setShowApiKeyStepUp(true)}
                onRevoke={setRevokingKeyId}
                formatKeyDate={formatKeyDate}
                t={t}
                tokens={tokens}
              />

              {showApiKeyStepUp ? (
                <View style={localStyles.stepUpWrap}>
                  <StepUp
                    message={t('stepUp.apiKeyHandoff')}
                    actionLabel={t('stepUp.apiKeyHandoffAction')}
                    onAction={() => void startApiKeyStepUp()}
                    busy={apiKeyStepUpBusy}
                  />
                  {apiKeyStepUpError ? (
                    <Text
                      accessibilityRole="alert"
                      style={[localStyles.stepUpError, { color: tokens.statusBadText }]}
                    >
                      {t('stepUp.requestError')}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <McpConnectionInstructions t={t} tokens={tokens} />
            </>
          ) : null}
        </Animated.View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <WidgetInfoSheet
        open={showWidgetInfo}
        onClose={() => setShowWidgetInfo(false)}
        t={t}
        tokens={tokens}
      />

      <ConfirmSheet
        open={revokingKeyId !== null}
        title={t('orbitMcp.revoke')}
        message={t('orbitMcp.revokeConfirm')}
        cancelLabel={t('orbitMcp.cancel')}
        confirmLabel={t('orbitMcp.confirm')}
        destructive
        onCancel={() => setRevokingKeyId(null)}
        onConfirm={() => {
          if (revokingKeyId) revokeKeyMutation.mutate(revokingKeyId)
          setRevokingKeyId(null)
        }}
      />

      <CreateApiKeyModal
        open={createKeyModalOpen}
        onOpenChange={setCreateKeyModalOpen}
        onCreateKey={handleCreateKey}
        availableScopes={scopeOptions}
        apiError={createKeyError}
      />
    </SafeAreaView>
  )
}

const localStyles = StyleSheet.create({
  mcpIntro: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  upgradeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  mcpDescription: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  stepUpWrap: {
    gap: 8,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  stepUpError: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
})
