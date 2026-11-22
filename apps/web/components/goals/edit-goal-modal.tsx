'use client'
import { GuidedGoalEditFlow } from './guided/guided-goal-edit-flow'

interface EditGoalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal: {
    id: string
    title: string
    targetValue: number
    unit: string
    deadline: string | null
    type?: string
  }
}

/** An open edit is the guided goal flow on its summary. Closed, it renders nothing. */
export function EditGoalModal(props: Readonly<EditGoalModalProps>) {
  return props.open ? <OpenEditGoalModal {...props} /> : null
}

function OpenEditGoalModal(props: Readonly<EditGoalModalProps>) {
  return <GuidedGoalEditFlow goal={props.goal} onClose={() => props.onOpenChange(false)} />
}

