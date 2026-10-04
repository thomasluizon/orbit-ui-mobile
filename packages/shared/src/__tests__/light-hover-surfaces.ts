import { schemes } from '../theme/color-schemes'
import { neutralColors, selectionAlpha } from '../theme/neutral-ramp'
import { withAlpha } from './contrast'

const light = neutralColors.light

export const lightHoverTextSurfaces = [
  { name: 'canvas', layers: [light.bg] },
  { name: 'card', layers: [light.bg, light.bgCard] },
  { name: 'well', layers: [light.bg, light.bgWell] },
  { name: 'canvas hover', layers: [light.bg, light.bgHover] },
  { name: 'card hover', layers: [light.bg, light.bgCard, light.bgHover] },
  { name: 'well hover', layers: [light.bg, light.bgWell, light.bgHover] },
  { name: 'overlay hover', layers: [light.bg, light.bgElev, light.bgHover] },
  { name: 'replacement hover', layers: [light.bg, light.bgHover] },
  { name: 'card child hover', layers: [light.bg, light.bgCard, light.bgHover] },
  { name: 'canvas selection', layers: [light.bg, withAlpha(schemes.orange.accent.light.primary, selectionAlpha.light)] },
  { name: 'card selection', layers: [light.bg, light.bgCard, withAlpha(schemes.orange.accent.light.primary, selectionAlpha.light)] },
  { name: 'widget card', layers: ['#FFFFFF'] },
  { name: 'widget well', layers: ['#F1F1F2'] },
] as const
