/** The Orbit mark: a planet drawn as a HOLLOW ring with an open centre, an orbital band crossing in front at the lower left and passing behind at the upper right, and a small solid moon above right. The moon is the accent's one identity role. Silhouette rule: Orbit is a hollow ring, Astra is a solid letterform, readable at 16px. */
export interface OrbitMarkProps {
  size?: number;
  /** false = monochrome treatment (the lockup uses this) */
  accent?: boolean;
}
export declare function OrbitMark(props: OrbitMarkProps): any;
