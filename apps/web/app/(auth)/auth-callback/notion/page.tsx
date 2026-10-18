import { Suspense } from 'react'
import { NotionCallbackContent } from './notion-callback-content'

export default function NotionCallbackPage() {
  return <Suspense fallback={null}><NotionCallbackContent /></Suspense>
}
