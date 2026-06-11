interface VerifiedBadgeProps {
  size?: number
}

/** Kit verified badge: scalloped check on a circular primary-tinted disc. */
export function VerifiedBadge({ size = 96 }: Readonly<VerifiedBadgeProps>) {
  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{ width: size, height: size, background: 'rgba(var(--primary-rgb), 0.15)' }}
      aria-hidden="true"
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 1.5l2.3 1.7 2.8-.4 1.2 2.6 2.6 1.2-.4 2.8L22 12l-1.7 2.3.4 2.8-2.6 1.2-1.2 2.6-2.8-.4L12 22.5l-2.3-1.7-2.8.4-1.2-2.6-2.6-1.2.4-2.8L2 12l1.7-2.3-.4-2.8 2.6-1.2L7.1 3.1l2.8.4z"
          stroke="var(--primary)"
          strokeWidth="1.6"
          strokeLinejoin="round"
          fill="rgba(var(--primary-rgb), 0.12)"
        />
        <path
          d="M8.5 12.2l2.4 2.3 4.6-4.8"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
