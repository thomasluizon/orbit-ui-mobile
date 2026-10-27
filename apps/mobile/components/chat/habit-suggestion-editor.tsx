import type { HabitSuggestionDraft } from '@orbit/shared/types'
import { normalizeHabitDetailForDrill } from '@orbit/shared/utils'
import { useHabitDetail } from '@/hooks/use-habits'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'

export function HabitSuggestionEditor({ draft, onClose, onSaved }: Readonly<{ draft: HabitSuggestionDraft; onClose: () => void; onSaved: () => void }>) {
  const current = useHabitDetail(draft.existingHabitId ?? null)
  if (!draft.existingHabitId) return <CreateHabitModal open fromConversation initialSuggestion={draft} onClose={onClose} onCreated={onSaved} />
  if (!current.data) return null
  return <EditHabitModal open initialSuggestion={draft} habit={normalizeHabitDetailForDrill(current.data, draft.dueDate).parent} onClose={onClose} onSaved={onSaved} />
}
