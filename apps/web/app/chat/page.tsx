import { getRouteMetadata } from '@/lib/route-metadata'
import { redirect } from 'next/navigation'

export function generateMetadata() {
  return getRouteMetadata('/chat')
}

export default function ChatRedirect() {
  redirect('/?astra=open')
}
