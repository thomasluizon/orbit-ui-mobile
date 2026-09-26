export const zLayers = {
  dropdown: 1000,
  sticky: 1100,
  modalBackdrop: 1200,
  modal: 1300,
  tourSpotlight: 1400,
  celebration: 1500,
  toast: 1600,
  tooltip: 1700,
} as const

export type ZLayer = keyof typeof zLayers
