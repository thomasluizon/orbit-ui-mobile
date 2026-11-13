import type { OrbitLookTarget } from '../brand/OrbitMascot'

/** The one-question flow frame: header row, centred block, free path and the pinned primary action. It holds no habit-specific code. */
export interface QuestionFlowProps {
  /** The question is the `h1` of the step, the visible label and the accessible name. */
  question: string
  /** The Orbit line. Absent when no job applies, and the block closes up. */
  line?: string | null
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
  }
  /** One quiet control under the block, such as a link. */
  footer?: React.ReactNode
}
