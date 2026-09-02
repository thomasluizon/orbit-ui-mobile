'use client'

import { useTranslations } from 'next-intl'
import { createPendingOperationCard } from '@orbit/shared/chat'
import { Badge } from '@/components/ui/badge'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { OtpInput } from '@/components/ui/otp-input'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { StepUp } from '@/components/ui/step-up'

function PrivacyText({ children }: Readonly<{ children: React.ReactNode }>) {
  return <p className="text-sm text-[var(--fg-3)]">{children}</p>
}

function useTranslate() {
  const t = useTranslations()
  return (key: string, values?: Record<string, string | number>) => t(key, values)
}

export const PendingOperationCard = createPendingOperationCard({
  Badge,
  BlockFrame,
  Button,
  ConfirmSheet,
  OtpInput,
  PrivacyText,
  Sheet,
  StepUp,
  useSheetHost,
  useTranslate,
})
