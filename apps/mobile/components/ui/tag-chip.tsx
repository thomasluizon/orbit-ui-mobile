import { View } from 'react-native'
import type { HabitTag } from '@orbit/shared/types/habit'
import { Chip } from './chip'

interface TagChipProps {
  tag: HabitTag
  active?: boolean
  onPress?: () => void
}

/** Chip variant that prepends a 6px color dot from the tag's user-chosen `color`. */
export function TagChip({ tag, active = false, onPress }: Readonly<TagChipProps>) {
  return (
    <Chip
      active={active}
      onPress={onPress}
      accessibilityLabel={tag.name}
      leading={
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            backgroundColor: tag.color,
          }}
        />
      }
    >
      {tag.name}
    </Chip>
  )
}
