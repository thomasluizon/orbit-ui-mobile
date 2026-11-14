import type { GuidedFlowId } from '../../utils/guided-flow-events'

/** The one-question flow frame: header row, centred block, free path and the pinned primary action. It holds no habit-specific code. */
export interface QuestionFlowProps {
  /** The flow id the `guided_flow_*` events carry. Each consumer passes its own. */
  flow: GuidedFlowId
  /** The question is the `h1` of the step, the visible label and the accessible name. */
  question: string
  /** The Orbit line. Absent when no job applies, and the block closes up. */
  line?: string | null
  /** Changes when the line changes with no step change, such as after a press on a tag. A new key fades the line in with `motionDurations.micro`, at once under reduced motion. Absent, the line swaps with no motion. */
  lineKey?: string
  /** Changes on each step. A change moves focus to the question and slides the step. */
  stepKey: string
  position: number
  total: number
  /** The accessible name of the progress, for example `Passo 2 de 3`. */
  progressLabel: string
  backLabel: string
  closeLabel: string
  /** Absent on the first step. The 48 slot stays. */
  onBack?: (() => void) | undefined
  onClose: () => void
  /** 1 forward, -1 back. */
  direction: 1 | -1
  orbitState?: 'parado' | 'pensando' | 'feliz' | 'descansando'
  /** False on a flow that holds no mascot, such as a Perfil flow with a destructive step. The block then starts at the question. Default true. */
  showOrbit?: boolean
  /** The plain-text status that stands for a visible Orbit state to assistive technology. */
  statusText?: string
  options?: React.ReactNode
  /** The free path: a labelled field plus the picker for the value. */
  children?: React.ReactNode
  primary?: {
    label: string
    onPress: () => void
    loading?: boolean
    hint?: string
    /** The tone of a step that deletes, such as the typed confirmation of a fresh start. Default primary. */
    variant?: 'caution' | 'destructive'
  }
  /** One quiet control under the block, such as a link. */
  footer?: React.ReactNode
}

/** What one step shows. A step owner returns it and the flow host passes it to the frame: `free` becomes the children. */
export type FlowStepView = Pick<QuestionFlowProps, 'question' | 'line' | 'options' | 'primary' | 'orbitState' | 'statusText'> & {
  free?: React.ReactNode
  /** Changes when the Orbit line changes with no step change, such as after a press on a tag. The host passes it to the frame, which cross-fades the line. */
  lineKey?: string
  /** A question inside the step, such as the template question of the checklist step. The host passes it as the frame `stepKey`, so the question slides and takes focus. */
  stepKey?: string
  /** Back inside the step. When present, the host calls it instead of its own back. */
  onBack?: () => void
}
