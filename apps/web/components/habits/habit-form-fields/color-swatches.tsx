interface ColorSwatchesProps {
  colors: readonly string[]
  activeColor: string
  onSelect: (color: string) => void
  ariaLabel: (color: string) => string
}

export function ColorSwatches({
  colors,
  activeColor,
  onSelect,
  ariaLabel,
}: Readonly<ColorSwatchesProps>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={ariaLabel(color)}
          aria-pressed={activeColor === color}
          className="size-5 rounded-full transition-transform hover:scale-110"
          style={{
            backgroundColor: color,
            boxShadow:
              activeColor === color ? 'inset 0 0 0 2px var(--primary)' : undefined,
          }}
          onClick={() => onSelect(color)}
        />
      ))}
    </div>
  )
}
