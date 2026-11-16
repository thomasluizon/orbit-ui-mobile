import { motionPresets } from '@orbit/shared/theme'

/**
 * The selection settle of `DESIGN.md` Motion as a Reanimated CSS `transition`: a ring or a fill eases in on the
 * selection preset as it is selected and out on its shorter exit as it is cleared, and changes at once under reduced motion.
 */
export function selectionSettleTransition(property: string, selected: boolean, reducedMotion: boolean): string {
  if (reducedMotion) return 'none'
  const { enterDuration, exitDuration, enterEasing, exitEasing } = motionPresets.selection
  return selected
    ? `${property} ${enterDuration}ms cubic-bezier(${enterEasing.join(',')})`
    : `${property} ${exitDuration}ms cubic-bezier(${exitEasing.join(',')})`
}
