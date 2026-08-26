/** Loading skeleton shaped like the final layout at the final dimensions, so nothing shifts when data lands.
 *  No spinner, ever, and no shimmer: the only motion is an opacity pulse, which stops under
 *  prefers-reduced-motion and pauses while off screen. Sets aria-busy on the region. */
export interface SkeletonProps {
  /** the shape it stands in for. 'grid' is a rows x cols field of round cells at the final cell size, for a
   *  month of days: it holds the grid's exact dimensions so the month does not reflow when the data lands. */
  variant?: 'habit-row' | 'settings' | 'stat-tile' | 'grid';
  /** rows / tiles / grid rows */
  rows?: number;
  /** grid only: cells per row. Take it from the same week-start data the real grid uses; default 7. */
  cols?: number;
  /** grid only: the cell edge in px, matched to the real cell so the two occupy the same box. Default 36. */
  cell?: number;
  /** grid only: the gap between cells, matched to the real grid. Default var(--s-2). */
  gap?: string | number;
  /** REQUIRED: the accessible loading name, in the screen's locale (e.g. "Carregando" / "Loading").
   *  No default exists in either language. */
  label: string;
}
export declare function Skeleton(props: SkeletonProps): any;
