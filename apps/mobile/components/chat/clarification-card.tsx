import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ClarificationRequest } from '@orbit/shared/types'
import { useResolveClarification } from '@/hooks/use-resolve-clarification'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function ClarificationCard({ clarificationRequest, entityName }: Readonly<{ clarificationRequest: ClarificationRequest; entityName?: string | null }>) {
  const { t } = useTranslation()
  const resolve = useResolveClarification()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const choose = async (label: string, value: string) => {
    setErrorKey(null)
    try {
      const result = await resolve.mutateAsync({ operationId: clarificationRequest.operationId, value })
      if (result.operation.status !== 'Succeeded') setErrorKey('habits.clarification.errorGeneric')
      else setResolvedLabel(label)
    } catch (error: unknown) {
      setErrorKey(errorKeyForStatus(errorStatus(error)))
    }
  }
  return (
    <BlockFrame state={resolve.isPending ? 'acting' : 'resting'} title={t(clarificationRequest.question, { defaultValue: clarificationRequest.question })} items={[]} actions={(
      <View style={{ alignItems: 'flex-start', gap: 12 }}>
        {resolvedLabel ? <Text accessibilityLiveRegion="polite" style={{ color: tokens.fg2 }}>{t('habits.clarification.successCreated', { name: entityName ?? resolvedLabel })}</Text> : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{clarificationRequest.quickActions.map((action) => {
            const label = t(action.label, { defaultValue: action.label })
            return <Button key={action.value} variant="ghost" size="sm" disabled={resolve.isPending} onClick={() => void choose(label, action.value)}>{label}</Button>
          })}</View>
        )}
        {errorKey ? <Text accessibilityRole="alert" style={{ color: tokens.statusBad }}>{t(errorKey)}</Text> : null}
      </View>
    )} />
  )
}

function errorStatus(error: unknown): number {
  if (typeof error !== 'object' || error === null || !('status' in error)) return 0
  return typeof error.status === 'number' ? error.status : 0
}

function errorKeyForStatus(status: number): string {
  if (status === 404 || status === 410) return 'habits.clarification.errorExpired'
  if (status === 409) return 'habits.clarification.errorAlreadyResolved'
  return 'habits.clarification.errorGeneric'
}
