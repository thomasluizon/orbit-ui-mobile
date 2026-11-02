import type { StateHook } from '../hooks/state-adapter'
import type { createConversationHistory } from './conversation-history'

export interface ConversationHistoryState {
  failed: 'load' | 'earlier' | 'delete' | null
  confirmationOpen: boolean
  requestDelete: () => void
  cancelDelete: () => void
  confirmDelete: () => Promise<boolean>
  loadEarlier: () => Promise<boolean>
  retry: () => void
}

export function createUseConversationHistory(adapter: {
  useState: StateHook
  useEffect: (effect: () => (() => void), dependencies: readonly unknown[]) => void
  history: ReturnType<typeof createConversationHistory>
  getAccountGeneration: () => number
}): () => ConversationHistoryState {
  return function useConversationHistory(): ConversationHistoryState {
    const [failed, setFailed] = adapter.useState<'load' | 'earlier' | 'delete' | null>(null)
    const [confirmationOpen, setConfirmationOpen] = adapter.useState(false)
    async function perform(kind: 'load' | 'earlier' | 'delete') {
      const generation = adapter.getAccountGeneration()
      setFailed(null)
      try {
        return await (kind === 'load' ? adapter.history.latest(true) : kind === 'earlier' ? adapter.history.earlier() : adapter.history.remove())
      } catch {
        if (generation === adapter.getAccountGeneration()) setFailed(kind)
        return false
      }
    }
    adapter.useEffect(() => {
      let mounted = true
      const generation = adapter.getAccountGeneration()
      void adapter.history.latest(true).catch(() => {
        if (mounted && generation === adapter.getAccountGeneration()) setFailed('load')
      })
      return () => { mounted = false }
    }, [])
    return {
      failed, confirmationOpen,
      requestDelete: () => setConfirmationOpen(true), cancelDelete: () => setConfirmationOpen(false),
      confirmDelete: async () => { setConfirmationOpen(false); return perform('delete') },
      loadEarlier: () => perform('earlier'),
      retry: () => { if (failed === 'delete') setConfirmationOpen(true); else void perform(failed ?? 'load') },
    }
  }
}
