import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { formatRouteTitle, ROUTE_TITLE_KEYS, type TitledRoute } from './route-titles'

export async function getRouteMetadata(route: TitledRoute): Promise<Metadata> {
  const t = await getTranslations()
  return { title: formatRouteTitle(t(ROUTE_TITLE_KEYS[route])) }
}
