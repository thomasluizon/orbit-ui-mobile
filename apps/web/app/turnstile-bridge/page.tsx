import { supportedLocales } from '@orbit/shared/i18n'
import { TurnstileBridge } from './turnstile-bridge'

export default async function TurnstileBridgePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ siteKey?: string; language?: string }> }>) {
  const { siteKey, language } = await searchParams
  if (!siteKey) return null
  return <TurnstileBridge siteKey={siteKey} language={supportedLocales.find((locale) => locale === language)} />
}
