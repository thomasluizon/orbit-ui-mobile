'use client'

import { useTranslations } from 'next-intl'
import { useNotFoundShell } from '@/components/shell/destination-shell'
import { PillLink } from '@/components/ui/pill-button'
import { OrbitMark } from '@/components/ui/orbit-mark'

export function NotFoundContent({ inShell = false }: Readonly<{ inShell?: boolean }>) {
  const t = useTranslations()
  useNotFoundShell()
  return (
    <section className={`error-surface${inShell ? ' error-surface--in-shell' : ''}`} data-state="not-found">
      <OrbitMark size={40} />
      <h1 className="error-surface-title">{t('notFoundPage.title')}</h1>
      <p className="error-surface-body">{t('notFoundPage.description')}</p>
      <div className="error-surface-action">
        <PillLink href="/">{t('notFoundPage.action')}</PillLink>
      </div>
    </section>
  )
}
