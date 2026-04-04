import './pro-badge.css'

export function ProBadge({ label = 'PRO' }: { label?: string }) {
  return (
    <span className="pro-badge-shimmer bg-primary/15 text-primary text-[10px] font-bold rounded-full px-1.5 py-0.5 transition-all duration-150">
      {label}
    </span>
  )
}
