/** Orbit, the mascot: a filled planet with two vertical pill eyes, one ring and one moon. Mood shows through the eyes only. The live rig draws at 48, 96 and 128. From 16 to 24 the mark is the small static face. The mascot is decorative and hidden from assistive technology. */
export type OrbitMascotLiveSize = 48 | 96 | 128
export type OrbitMascotSmallSize = 16 | 20 | 24
export type OrbitMascotSize = OrbitMascotLiveSize | OrbitMascotSmallSize

export const ORBIT_MASCOT_LIVE_SIZES: readonly OrbitMascotLiveSize[] = [48, 96, 128]
export const ORBIT_MASCOT_SMALL_SIZES: readonly OrbitMascotSmallSize[] = [16, 20, 24]

/** Where Orbit looks, each axis from -1 to 1 across the control in focus. */
export interface OrbitLookTarget {
  readonly x: number
  readonly y: number
}

export interface OrbitMascotProps {
  /** The drawn width. The height follows the 7:5 box of the rig or the 4:3 box of the small face. */
  size: OrbitMascotSize
  /** Defaults to parado. The small static face has one state. */
  state?: 'parado' | 'pensando' | 'feliz' | 'descansando'
  /** Draws the rest frame and never runs the idle loop. An Orbit inside a button, a chip or a row control is still. */
  still?: boolean
  /** The planet and the ring. Defaults to the foreground token. */
  color?: string
  /** The conversation entry: on a view that shows it, it is the live Orbit, and every other Orbit in that view is still. */
  lead?: boolean
  /** The control in focus. Orbit shows Olhando: the pill eyes move toward it. It never changes a state other than parado, and reduced motion keeps the eyes still. */
  lookAt?: OrbitLookTarget | null
}
