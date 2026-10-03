import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { StyleSheet } from 'react-native'

export const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  structuralColumn: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderRadius: 999,
    overflow: 'hidden',
  },
  bodyButton: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  bodyButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  emojiWell: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontFamily: 'Geist_500Medium',
    letterSpacing: -0.08,
    lineHeight: 20,
  },
  meta: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  parentRingButton: {
    width: 48,
    minHeight: 48,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    width: 48,
    minHeight: 48,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET_MIN,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  menuItemLabel: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
    marginHorizontal: 8,
  },
})
