import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createTranslator } from 'next-intl'
import { API } from '@orbit/shared/api'
import {
  publicProfileViewSchema,
  type PublicProfileView as PublicProfileViewData,
} from '@orbit/shared/types/public-profile'
import type { SupportedLocale } from '@orbit/shared/types/profile'
import { serverPublicFetch } from '@/lib/server-fetch'
import { PublicProfileView } from '@/components/profile/public-profile-view'

export const revalidate = 60

interface PageParams {
  params: Promise<{ slug: string }>
}

function normalizeLocale(language: string | null | undefined): SupportedLocale {
  return language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

async function fetchView(slug: string): Promise<PublicProfileViewData | null> {
  const raw = await serverPublicFetch<unknown>(API.publicProfile.bySlug(slug))
  if (raw == null) return null
  return publicProfileViewSchema.parse(raw)
}

async function loadMessages(locale: SupportedLocale) {
  return (await import(`@orbit/shared/i18n/${locale}.json`)).default
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params
  const view = await fetchView(slug)
  const locale = normalizeLocale(view?.language)
  const messages = await loadMessages(locale)
  const t = createTranslator({ locale, messages, namespace: 'profile.publicProfile.meta' })

  const title = view ? t('title', { name: view.displayName }) : t('titleFallback')
  const description = t('description', { name: view?.displayName ?? 'Orbit' })

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
      images: [{ url: '/og-profile.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og-profile.png'],
    },
  }
}

export default async function PublicProfileSlugPage({ params }: PageParams) {
  const { slug } = await params
  const view = await fetchView(slug)
  if (!view) notFound()

  const locale = normalizeLocale(view.language)
  const messages = await loadMessages(locale)
  const t = createTranslator({ locale, messages })

  return <PublicProfileView view={view} t={t} />
}
