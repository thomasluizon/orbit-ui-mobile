
import type { CreateGoalSheetProps } from '@orbit/shared/hooks'
import { GuidedGoalCreateFlow } from './guided/guided-goal-create-flow'

/** An open sheet is the guided goal flow. Closed, it renders nothing. */
export function CreateGoalSheet(props: Readonly<CreateGoalSheetProps>) {
  return props.open ? <OpenCreateGoalSheet {...props} /> : null
}

function OpenCreateGoalSheet(props: Readonly<CreateGoalSheetProps>) {
  return <GuidedGoalCreateFlow {...props} />
}

