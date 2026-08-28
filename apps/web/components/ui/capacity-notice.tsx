import type { CapacityNoticeProps } from '@orbit/shared/contracts/feedback'

/** A neutral boundary and the one action that changes it. */
export function CapacityNotice({ message, body, action }: Readonly<CapacityNoticeProps>) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[var(--r-well)] bg-[var(--bg-well)] p-4 text-[var(--fg-1)]"
      data-capacity-notice
    >
      <p className="text-base font-medium" style={{ fontFamily: 'var(--font-sans)' }}>
        {message}
      </p>
      {body ? (
        <p className="text-sm leading-5 text-[var(--fg-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
          {body}
        </p>
      ) : null}
      {action ? <div data-capacity-notice-action>{action}</div> : null}
    </div>
  )
}
