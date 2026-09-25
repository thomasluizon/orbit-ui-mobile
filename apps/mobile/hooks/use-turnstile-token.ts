import { useEffect, useState } from 'react'
import { createTurnstileTokenState, TurnstileTokenController } from '@orbit/shared/hooks'

export function useTurnstileToken(siteKey: string | undefined, isOnline: boolean) {
  const [state, setState] = useState(createTurnstileTokenState)
  const [controller] = useState(() => new TurnstileTokenController(setState))

  useEffect(() => {
    if (!isOnline) controller.clear()
  }, [controller, isOnline])

  return controller.view(state, siteKey)
}
