import { useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { ClarificationRequest } from '@orbit/shared/types'
import { useResolveClarification } from '@/hooks/use-resolve-clarification'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

interface ClarificationCardProps {
  clarificationRequest: ClarificationRequest
  entityName?: string | null
}

export function ClarificationCard({
  clarificationRequest,
  entityName,
}: Readonly<ClarificationCardProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const resolve = useResolveClarification()
  const styles = useMemo(() => createStyles(tokens), [tokens])

  const [activeValue, setActiveValue] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  async function handleSelect(label: string, value: string) {
    if (resolve.isPending || resolved) return
    setActiveValue(value)
    setErrorKey(null)

    try {
      const response = await resolve.mutateAsync({
        operationId: clarificationRequest.operationId,
        value,
      })
      if (response.operation.status !== 'Succeeded') {
        setErrorKey('habits.clarification.errorGeneric')
        return
      }
      setResolved(true)
      setResolvedLabel(label)
    } catch (err: unknown) {
      const status =
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        typeof (err as { status?: unknown }).status === 'number'
          ? (err as { status: number }).status
          : 0
      setErrorKey(mapStatusToErrorKey(status))
    } finally {
      setActiveValue(null)
    }
  }

  if (resolved) {
    return (
      <View style={styles.card}>
        <View style={styles.successRow}>
          <View style={styles.successIcon}>
            <Check size={14} color={tokens.statusDone} />
          </View>
          <Text style={styles.successText}>
            {t('habits.clarification.successCreated', {
              name: entityName ?? resolvedLabel ?? '',
            })}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.card}>
      <Text style={styles.questionText}>
        {t(clarificationRequest.question, {
          defaultValue: clarificationRequest.question,
        })}
      </Text>

      <View style={styles.actionsRow}>
        {clarificationRequest.quickActions.map((action) => {
          const label = t(action.label, { defaultValue: action.label })
          const isActive = activeValue === action.value
          const disabled = resolve.isPending

          return (
            <Pressable
              key={action.value}
              style={({ pressed }) => [
                styles.chip,
                isActive && styles.chipActive,
                disabled && styles.chipDisabled,
                pressed && !disabled && styles.chipPressed,
              ]}
              disabled={disabled}
              onPress={() => void handleSelect(label, action.value)}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
            >
              {isActive && <ActivityIndicator size="small" color={tokens.primary} />}
              <Text style={styles.chipText}>{label}</Text>
            </Pressable>
          )
        })}
      </View>

      {errorKey && (
        <Text style={styles.errorText} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {t(errorKey)}
        </Text>
      )}
    </View>
  )
}

function mapStatusToErrorKey(status: number): string {
  if (status === 404 || status === 410) return 'habits.clarification.errorExpired'
  if (status === 409) return 'habits.clarification.errorAlreadyResolved'
  return 'habits.clarification.errorGeneric'
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    card: {
      backgroundColor: tokens.bgCard,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 16,
      padding: 16,
      gap: 12,
    },
    questionText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fg1,
    },
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    chipActive: {
      borderColor: tokens.hairlineStrong,
      backgroundColor: tokens.bgElev,
    },
    chipPressed: {
      transform: [{ scale: 0.96 }],
      backgroundColor: tokens.bgElev2,
    },
    chipDisabled: {
      opacity: 0.5,
    },
    chipText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg1,
    },
    errorText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      color: tokens.statusBadText,
    },
    successRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
    },
    successIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: `${tokens.statusDone}33`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    successText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.statusDone,
    },
  })
}
