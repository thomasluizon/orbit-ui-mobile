import { useRef, useState } from 'react'

import type { PreviewItemTitleProps } from '@orbit/shared/chat'

export function usePreviewTitle({ title, rename }: PreviewItemTitleProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const active = useRef(false)
  const start = () => {
    if (!rename || rename.disabled) return
    active.current = true
    setDraft(title)
    setEditing(true)
  }
  const cancel = () => {
    active.current = false
    setDraft(title)
    setEditing(false)
  }
  const save = async () => {
    if (!active.current || !rename || rename.disabled) return
    active.current = false
    const next = draft
    if (next === title) { cancel(); return }
    if (await rename.onSave(next)) setEditing(false)
    else active.current = true
  }
  return { editing, draft, setDraft, start, cancel, save }
}
