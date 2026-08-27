import type { ColumnsProps } from '@orbit/shared/contracts/display'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** A categorical comparison with no time axis or implied gaps. */
export function Columns({
  columns = [],
  max,
  height = 120,
  currentId,
  showValues = false,
  label,
  emptyLabel,
}: Readonly<ColumnsProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const measuredMax = Math.max(0, ...columns.map((column) => column.value))
  const scaleMax = max !== undefined && max > 0 ? max : measuredMax
  const allZero = measuredMax === 0

  return (
    <View style={[styles.columns, { height }]} accessible={false}>
      {columns.map((column) => {
        const ratio = scaleMax > 0 ? Math.min(1, Math.max(0, column.value / scaleMax)) : 0
        const isCurrent = column.id === currentId
        const accessibleValue = allZero ? emptyLabel : String(column.value)
        const accessibleLabel = `${column.label}: ${accessibleValue}`

        return (
          <View
            key={column.id}
            style={styles.column}
            accessible
            accessibilityRole="image"
            accessibilityLabel={label ? `${label}. ${accessibleLabel}` : accessibleLabel}
            testID={isCurrent ? 'column-current' : 'column-neutral'}
          >
            {showValues ? (
              <Text style={[styles.value, { color: tokens.fg2 }]}>{accessibleValue}</Text>
            ) : null}
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: column.value === 0
                      ? tokens.statusEmpty
                      : isCurrent
                        ? tokens.primary
                        : tokens.fg3,
                    height: column.value === 0 ? 2 : `${ratio * 100}%`,
                  },
                ]}
              />
            </View>
            <Text numberOfLines={2} style={[styles.label, { color: tokens.fg2 }]}>
              {column.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  columns: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
  },
  column: {
    flex: 1,
    height: '100%',
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  track: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  fill: {
    width: '100%',
    maxWidth: 48,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  value: {
    fontFamily: 'RobotoMono_400Regular',
    fontSize: 12,
  },
  label: {
    minHeight: 40,
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
})
