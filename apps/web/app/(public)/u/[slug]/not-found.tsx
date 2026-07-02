import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function PublicProfileNotFound() {
  const t = await getTranslations('profile.publicProfile.notFound')

  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ minHeight: '70dvh', gap: 14, padding: 24 }}
    >
      <h1 className="t-h2" style={{ margin: 0 }}>
        {t('title')}
      </h1>
      <p style={{ margin: 0, maxWidth: 320, fontFamily: 'var(--font-sans)', fontSize: 15, lineHeight: 1.5, color: 'var(--fg-3)' }}>
        {t('body')}
      </p>
      <Link
        href="/login"
        className="inline-flex items-center justify-center rounded-full shadow-[var(--primary-glow)] transition-[background-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px hover:bg-[var(--primary-pressed)] hover:shadow-[var(--primary-glow-hover)] active:translate-y-0 active:scale-[0.98]"
        style={{
          marginTop: 6,
          padding: '15px 26px',
          background: 'var(--primary)',
          color: 'var(--fg-on-primary)',
          fontFamily: 'var(--font-sans)',
          fontSize: 16,
          fontWeight: 500,
        }}
      >
        {t('cta')}
      </Link>
    </div>
  )
}
