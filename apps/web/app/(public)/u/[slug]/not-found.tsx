import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'

export default async function PublicProfileNotFound() {
  const t = await getTranslations('profile.publicProfile.notFound')

  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ minHeight: '70dvh', gap: 14, padding: 24 }}
    >
      <SatelliteGlyph size={96} />
      <h1 className="t-h1" style={{ margin: 0 }}>
        {t('title')}
      </h1>
      <p style={{ margin: 0, maxWidth: 320, fontFamily: 'var(--font-sans)', fontSize: 15, lineHeight: 1.5, color: 'var(--fg-3)' }}>
        {t('body')}
      </p>
      <Link href="/login" className="pill-link" style={{ marginTop: 6 }}>
        {t('cta')}
      </Link>
    </div>
  )
}
