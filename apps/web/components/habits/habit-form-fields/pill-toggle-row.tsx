import type { ReactNode } from 'react'

interface PillToggleOption {
  key: string
  label: ReactNode
  active: boolean
  onClick: () => void
}

interface PillToggleRowProps {
  options: PillToggleOption[]
  containerClassName: string
  buttonClassName: string
  activeClassName: string
  inactiveClassName: string
}

export function PillToggleRow({
  options,
  containerClassName,
  buttonClassName,
  activeClassName,
  inactiveClassName,
}: Readonly<PillToggleRowProps>) {
  return (
    <div className={containerClassName}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={option.active}
          className={`${buttonClassName} ${option.active ? activeClassName : inactiveClassName}`}
          onClick={option.onClick}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
