import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function PublicProfileNotFound() {
  const t = await getTranslations('profile.publicProfile.notFound')

  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ minHeight: '70dvh', gap: 14, padding: 24 }}
    >
      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, color: 'var(--fg-1)' }}>
        {t('title')}
      </h1>
      <p style={{ margin: 0, maxWidth: 320, fontFamily: 'var(--font-sans)', fontSize: 15, lineHeight: 1.5, color: 'var(--fg-3)' }}>
        {t('body')}
      </p>
      <Link
        href="/login"
        className="inline-flex items-center justify-center rounded-full"
        style={{
          marginTop: 6,
          padding: '12px 24px',
          background: 'var(--primary)',
          color: 'var(--fg-on-primary)',
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        {t('cta')}
      </Link>
    </div>
  )
}
