import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { createPendingOperationCard } from '@orbit/shared/chat'
import { Badge } from '@/components/ui/badge'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { OtpInput } from '@/components/ui/otp-input'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { StepUp } from '@/components/ui/step-up'

function useTranslate() {
  const { t } = useTranslation()
  return (key: string, values?: Record<string, string | number>) => t(key, values)
}

export const PendingOperationCard = createPendingOperationCard({
  Badge,
  BlockFrame,
  Button,
  ConfirmSheet,
  OtpInput,
  PrivacyText: Text,
  Sheet,
  StepUp,
  useSheetHost,
  useTranslate,
})
