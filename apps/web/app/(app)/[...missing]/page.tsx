import { getRouteMetadata } from '@/lib/route-metadata'
import { notFound } from 'next/navigation'

export function generateMetadata() {
  return getRouteMetadata('/[...missing]')
}

export default function MissingPage() {
  notFound()
}
