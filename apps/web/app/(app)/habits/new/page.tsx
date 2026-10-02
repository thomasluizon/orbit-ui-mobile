'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { resolveHabitCreateReturnPath, resolveHabitDetailRouteDate } from '@orbit/shared/utils'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { useUIStore } from '@/stores/ui-store'
import { setRouteTransitionIntent } from '@/lib/motion/route-intent'

function HabitCreatePage() {
  const params = useSearchParams()
  const router = useRouter()
  const conversation = params.get('origin') === 'conversation'
  const from = params.get('from') ?? undefined
  function back() {
    setRouteTransitionIntent('back')
    if (conversation) useUIStore.getState().setAstraConversationOpen(true)
    router.replace(resolveHabitCreateReturnPath(from))
  }
  return <CreateHabitModal open presentation="screen" fromConversation={conversation}
    initialTitle={params.get('title') ?? ''} initialDate={resolveHabitDetailRouteDate(params.get('date'))}
    onOpenChange={(open) => { if (!open) back() }} />
}

export default function HabitCreateRoute() {
  return <Suspense fallback={null}><HabitCreatePage /></Suspense>
}
