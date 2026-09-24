'use client'

import { ProgressRing } from '@/components/ui/progress-ring'
import { StatusRing } from '@/components/ui/status-ring'

interface HabitLogButtonProps {
  label: string
  completed?: boolean
  logged: boolean
  onPress: () => void
  progress?: number
  disabled?: boolean
  disabledReason?: string
}

export function HabitLogButton({ label, logged, completed = logged, onPress, progress, disabled = false, disabledReason }: Readonly<HabitLogButtonProps>) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-0 bg-transparent transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${disabled ? 'cursor-default opacity-40' : 'cursor-pointer hover:bg-[var(--bg-hover)]'}`}
    >
      <span aria-hidden="true" className="grid place-items-center">
        {progress === undefined || completed ? (
          <StatusRing status={completed ? 'done' : 'empty'} size={30} label="" />
        ) : (
          <ProgressRing value={progress} size={30} label="" />
        )}
      </span>
    </button>
  )
}
