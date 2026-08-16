import { X, PenSquare } from '@/components/ui/icons'

interface HabitTagChipProps {
  tag: { id: string; name: string; color: string }
  selected: boolean
  animationClassName: string
  atLimit: boolean
  disabled: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  editAriaLabel: string
  deleteAriaLabel: string
}

export function HabitTagChip({
  tag,
  selected,
  animationClassName,
  atLimit,
  disabled,
  onToggle,
  onEdit,
  onDelete,
  editAriaLabel,
  deleteAriaLabel,
}: Readonly<HabitTagChipProps>) {
  return (
    <div
      className={`flex items-center rounded-full transition-[background-color,box-shadow,color,opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] ${
        selected
          ? 'text-white'
          : 'bg-[var(--bg-elev)] shadow-[inset_0_0_0_1px_var(--hairline)] text-[var(--fg-2)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg-1)]'
      } ${
        !selected && atLimit
          ? 'opacity-30 pointer-events-none'
          : ''
      } ${animationClassName}`}
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        fontWeight: 500,
        backgroundColor: selected ? tag.color : undefined,
      }}
    >
      <button
        type="button"
        className="pl-3 pr-1 py-2 flex items-center gap-1.5 hover:opacity-80"
        aria-pressed={selected}
        onClick={onToggle}
      >
        {!selected && (
          <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
        )}
        {tag.name}
      </button>
      <button
        type="button"
        className={`grid min-h-11 min-w-8 -my-2 place-items-center pl-0.5 hover:opacity-60 transition-opacity ${
          selected ? 'text-white/70' : 'text-[var(--fg-3)]'
        }`}
        aria-label={editAriaLabel}
        disabled={disabled}
        onClick={onEdit}
      >
        <PenSquare size={13} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`grid min-h-11 min-w-8 -my-2 place-items-center pr-2.5 pl-1 hover:opacity-60 transition-opacity ${
          selected ? 'text-white/70' : 'text-[var(--fg-3)]'
        }`}
        aria-label={deleteAriaLabel}
        disabled={disabled}
        onClick={onDelete}
      >
        <X size={13} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  )
}
