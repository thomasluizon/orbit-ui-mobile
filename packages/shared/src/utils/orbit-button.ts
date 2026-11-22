import { FAB_SIZE } from '../theme/button'
import { SPACING } from '../theme/spacing'

/** The space between the Orbit button and the create habit button under it: the 4px focus outline and the create button's 6px canvas ring keep the 8px interaction fill clearance. */
export const ORBIT_BUTTON_GAP = SPACING.s24

/** The end space a list keeps under the Orbit button stacked on the create habit button: the 16px column inset, both buttons, the gap and the 16px row gap. */
export const ORBIT_STACK_CLEARANCE = SPACING.s16 + FAB_SIZE + ORBIT_BUTTON_GAP + FAB_SIZE + SPACING.s16
