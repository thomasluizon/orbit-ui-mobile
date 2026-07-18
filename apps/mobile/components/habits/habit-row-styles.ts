import { StyleSheet } from 'react-native'

export const MAX_VISIBLE_TAGS = 3

export const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    position: 'relative',
  },
  rowPressed: {
    transform: [{ scale: 0.99 }],
  },
  emojiWell: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
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
  description: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    lineHeight: 17,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 1,
    overflow: 'hidden',
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  tagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tagName: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    maxWidth: 132,
  },
  tagOverflow: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  linkedGoalDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  childProgressText: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  checkCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    margin: -3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
