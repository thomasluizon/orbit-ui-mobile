
export interface ErrorStateProps {
  message: string
  action?: React.ReactElement
  /** The error stands in for the whole surface, as a load failure of a destination or a pushed screen does: Orbit in
   *  Parado sits above the message, at 96 in the compact shell and 128 at 1024 and above. An error inside a section,
   *  a sheet, a toast or a destructive confirmation draws no mascot. */
  fullSurface?: boolean
}
