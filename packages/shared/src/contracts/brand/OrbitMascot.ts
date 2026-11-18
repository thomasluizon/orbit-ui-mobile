/** Orbit, the mascot: a filled planet with two vertical pill eyes, one ring and one moon. Mood shows through the eyes only. The live rig draws at 48, 96 and 128. From 16 to 24 the mark is the small static face. The mascot is decorative and hidden from assistive technology. */
export type OrbitMascotLiveSize = 48 | 96 | 128
export type OrbitMascotSmallSize = 16 | 20 | 24
export type OrbitMascotSize = OrbitMascotLiveSize | OrbitMascotSmallSize

/** Who may run the idle loop. `lead` is the conversation entry. `withLead` is an Orbit line that runs only together with
 *  the entry of its view. `single` is any other live Orbit: a view runs one of them. */
export type OrbitLiveRole = 'lead' | 'withLead' | 'single'

export const ORBIT_MASCOT_LIVE_SIZES: readonly OrbitMascotLiveSize[] = [48, 96, 128]
export const ORBIT_MASCOT_SMALL_SIZES: readonly OrbitMascotSmallSize[] = [16, 20, 24]

export interface OrbitMascotProps {
  /** The drawn width. The height follows the 7:5 box of the rig or the 4:3 box of the small face. */
  size: OrbitMascotSize
  /** Defaults to parado. The small static face has one state. */
  state?: 'parado' | 'pensando' | 'feliz' | 'descansando'
  /** Draws the rest frame and never runs the idle loop. An Orbit inside a button is still, except the conversation entry
   *  and an Orbit line on its view (`live`), and a small face whose Orbit read runs (`reading`). */
  still?: boolean
  /** The small face only: an Orbit read that this control started runs, so the face plays its read motion until the read
   *  ends or fails. Reduced motion and `Orbit em movimento` off keep the face still. */
  reading?: boolean
  /** The planet and the ring. Defaults to the foreground token. */
  color?: string
  /** Defaults to `single`. On a view that shows the conversation entry (`lead`), the entry and every Orbit line of that view
   *  (`withLead`) run the loop together on one shared clock, and every other Orbit in that view is still. Without the entry,
   *  an Orbit line is still, and the first `single` Orbit in view runs the loop. */
  live?: OrbitLiveRole
}
