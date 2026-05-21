'use client'

import { Chip } from './chip'

/** Chip variant with a tag color leading dot. */
interface TagChipProps {
  tag: { id: string; name: string; color: string }
  active?: boolean
  onClick?: () => void
}

export function TagChip({ tag, active, onClick }: Readonly<TagChipProps>) {
  return (
    <Chip
      active={active}
      onClick={onClick}
      ariaLabel={tag.name}
      leading={
        <span
          aria-hidden="true"
          className="inline-block rounded-full shrink-0"
          style={{ width: 6, height: 6, background: tag.color }}
        />
      }
    >
      {tag.name}
    </Chip>
  )
}
