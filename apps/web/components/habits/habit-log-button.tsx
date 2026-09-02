'use client'

import { ProgressRing } from '@/components/ui/progress-ring'
import { StatusRing } from '@/components/ui/status-ring'

interface HabitLogButtonProps {
  label: string
  completed?: boolean
  logged: boolean
  onPress: () => void
  progress?: number
}

export function HabitLogButton({ label, logged, completed = logged, onPress, progress }: Readonly<HabitLogButtonProps>) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent transition-[background-color,transform] duration-[var(--dur-fast)] hover:bg-[var(--bg-hover)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
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
