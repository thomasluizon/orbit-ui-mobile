'use client'

import { useTranslations } from 'next-intl'

export default function ProgressPage() {
  const t = useTranslations()

  return (
    <section aria-labelledby="progress-title" className="px-4 py-8 md:px-0">
      <h1 id="progress-title" className="t-h1" tabIndex={-1}>
        {t('nav.progress')}
      </h1>
    </section>
  )
}
