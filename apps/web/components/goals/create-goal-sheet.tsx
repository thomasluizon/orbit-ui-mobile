'use client'
import type { CreateGoalSheetProps } from '@orbit/shared/hooks'
import { GuidedGoalCreateFlow } from './guided/guided-goal-create-flow'

type CreateGoalSheetHostProps = CreateGoalSheetProps & { restoreFocusOnCreate?: boolean }

/** An open sheet is the guided goal flow. Closed, it renders nothing. */
export function CreateGoalSheet(props: Readonly<CreateGoalSheetHostProps>) {
  return props.open ? <OpenCreateGoalSheet {...props} /> : null
}

function OpenCreateGoalSheet(props: Readonly<CreateGoalSheetHostProps>) {
  return <GuidedGoalCreateFlow {...props} />
}

