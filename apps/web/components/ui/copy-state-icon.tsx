import { Check, Copy } from '@/components/ui/icons'

const iconSwap = 'absolute inset-0 transition-[scale,opacity,filter] [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-standard)] motion-reduce:scale-100 motion-reduce:blur-[0px] motion-reduce:transition-none'
const hiddenIcon = 'scale-[0.25] opacity-0 blur-[4px]'
const shownIcon = 'scale-100 opacity-100 blur-[0px]'

/** Copy glyph that cross-fades to Check with the DESIGN.md icon swap; reduced motion swaps at once. */
export function CopyStateIcon({ copied, strokeWidth, color }: Readonly<{ copied: boolean; strokeWidth: number; color?: string }>) {
  return <span className="relative inline-flex size-5">
    <Copy aria-hidden="true" size={20} strokeWidth={strokeWidth} color={color} data-icon-swap="copy" className={`${iconSwap} ${copied ? hiddenIcon : shownIcon}`} />
    <Check aria-hidden="true" size={20} strokeWidth={strokeWidth} color={color} data-icon-swap="check" className={`${iconSwap} ${copied ? shownIcon : hiddenIcon}`} />
  </span>
}
