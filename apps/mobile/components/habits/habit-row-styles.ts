import { StyleSheet } from 'react-native'

export const styles = StyleSheet.create({
  readOnly: {
    opacity: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  structuralColumn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bodyButton: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    fontFamily: 'Rubik_500Medium',
    letterSpacing: -0.08,
    lineHeight: 20,
  },
  meta: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  parentRingButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 6,
  },
  menuItemLabel: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
    marginHorizontal: 8,
  },
})
