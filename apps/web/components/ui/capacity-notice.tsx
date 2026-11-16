import type { CapacityNoticeProps } from '@orbit/shared/contracts/feedback'
import { OrbitMascot } from '@/components/ui/orbit-mascot'

/** A neutral boundary and the one action that changes it. On an AI surface whose AI is the missing part, Orbit rests beside it at 48. */
export function CapacityNotice({ message, body, action, mascotState }: Readonly<CapacityNoticeProps>) {
  const content = (
    <>
      <p className="text-base font-medium" style={{ fontFamily: 'var(--font-sans)' }}>
        {message}
      </p>
      {body ? (
        <p className="text-sm leading-5 text-[var(--fg-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
          {body}
        </p>
      ) : null}
      {action ? <div data-capacity-notice-action>{action}</div> : null}
    </>
  )
  return (
    <div
      className={`flex gap-3 rounded-[var(--r-well)] bg-[var(--bg-well)] p-4 text-[var(--fg-1)] ${mascotState ? 'flex-row items-center' : 'flex-col'}`}
      data-capacity-notice
    >
      {mascotState ? <><OrbitMascot size={48} state={mascotState} /><div className="flex min-w-0 flex-1 flex-col gap-3">{content}</div></> : content}
    </div>
  )
}
