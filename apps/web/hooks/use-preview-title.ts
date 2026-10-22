import { useRef, useState } from 'react'

import type { PreviewItemTitleProps } from '@orbit/shared/chat'

export function usePreviewTitle({ title, rename }: PreviewItemTitleProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [restoreFocus, setRestoreFocus] = useState(false)
  const active = useRef(false)
  const start = () => {
    if (!rename || rename.disabled) return
    active.current = true
    setDraft(title)
    setRestoreFocus(false)
    setEditing(true)
  }
  const close = (focus: boolean) => {
    active.current = false
    rename?.onDraftChange?.(undefined)
    setRestoreFocus(focus)
    setEditing(false)
  }
  const cancel = () => {
    setDraft(title)
    close(true)
  }
  const save = async (focus = false) => {
    if (!active.current || !rename || rename.disabled) return
    active.current = false
    const next = draft
    if (next === title) { close(focus); return }
    if (await rename.onSave(next)) close(focus)
    else active.current = true
  }
  const changeDraft = (next: string) => {
    setDraft(next)
    rename?.onDraftChange?.(next === title ? undefined : next)
  }
  return { editing, draft, restoreFocus, setDraft: changeDraft, start, cancel, save }
}
