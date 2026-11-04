'use client'

import dynamic from 'next/dynamic'
import { useState, type ComponentProps } from 'react'
import { DeferredModal } from '@/components/ui/deferred-modal'
import type { HabitListConfirmDialogs as ConfirmDialogsComponent } from './confirm-dialogs'

const HabitListConfirmDialogs = dynamic<ComponentProps<typeof ConfirmDialogsComponent>>(() =>
  import('./confirm-dialogs').then(module => module.HabitListConfirmDialogs),
)

export function DeferredConfirmDialogs(props: Readonly<ComponentProps<typeof ConfirmDialogsComponent>>) {
  const [activated, setActivated] = useState(false)
  const open = props.showDeleteConfirm || props.deletePending || props.duplicateHabitName !== null || props.parentPrompt !== null
  if (open && !activated) setActivated(true)
  return <DeferredModal open={open}>{open || activated ? <HabitListConfirmDialogs {...props} /> : null}</DeferredModal>
}
