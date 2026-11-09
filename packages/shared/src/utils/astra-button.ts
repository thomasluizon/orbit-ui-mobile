import { SPACING } from '../theme/spacing'

/** The space between the Astra button and the create habit button under it: the 4px focus outline and the create button's 6px canvas ring keep the 8px interaction fill clearance. */
export const ASTRA_BUTTON_GAP = SPACING.s24

/** The diameter of the create habit button and the Astra button. */
export const FAB_SIZE = 60

/** The end space a list keeps under the Astra button stacked on the create habit button: the 16px column inset, both buttons, the gap and the 16px row gap. */
export const ASTRA_STACK_CLEARANCE = SPACING.s16 + FAB_SIZE + ASTRA_BUTTON_GAP + FAB_SIZE + SPACING.s16
