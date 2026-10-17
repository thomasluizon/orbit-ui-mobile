'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ProgressSubmenuId } from '@orbit/shared/utils/progress-navigation'
import { PageHeader } from '@/components/ui/page-header'

export function ProgressSubscreen({ screen, children, hideHeader = false }: Readonly<{ screen: ProgressSubmenuId; children: ReactNode; hideHeader?: boolean }>) {
  const router = useRouter()
  const t = useTranslations()
  return <div className="mx-auto flex w-full min-w-0 max-w-[740px] flex-col" data-progress-screen={screen}>
    {!hideHeader ? <PageHeader title={t(`progressScreen.sections.${screen}`)} backLabel={t('progressScreen.back')} onBack={() => router.replace('/progress')} /> : null}
    <div className="flex min-w-0 flex-col gap-section-stack-gap px-screen-gutter py-4">{children}</div>
  </div>
}
