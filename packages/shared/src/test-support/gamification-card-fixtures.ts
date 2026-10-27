import { createMockAchievement, createMockGamificationProfile } from '../__tests__/factories'
import { focusedReadMetadataFixture } from './chat-fixtures'

export const gamificationAchievementFixture = createMockAchievement({
  id: 'first_orbit', iconKey: 'satellite', isEarned: true, earnedAtUtc: '2026-09-01T12:00:00Z',
})

export const gamificationProfileFixture = {
  ...createMockGamificationProfile(),
  levelTitleKey: 'progressScreen.achievements.levelTitles.orbiter',
}

export const gamificationReadFixture = {
  ...focusedReadMetadataFixture,
  queryFamily: 'get_gamification_overview',
  scope: { include_profile: true, include_achievements: true, include_streak: false, as_of: '2026-09-01' },
}

export const gamificationCardFixture = {
  state: { profile: { ...gamificationProfileFixture, achievements: [], userAchievements: [] }, achievements: { achievements: [gamificationAchievementFixture] }, streak: null },
  surfaceId: 'progress',
  read: gamificationReadFixture,
}

export const gamificationCardCases = [
  { name: 'profile only', block: { ...gamificationCardFixture, state: { profile: gamificationProfileFixture, achievements: null, streak: null } } },
  { name: 'achievements only', block: { ...gamificationCardFixture, state: { ...gamificationCardFixture.state, profile: null } } },
  { name: 'both', block: gamificationCardFixture },
  { name: 'empty achievements', block: { ...gamificationCardFixture, state: { profile: null, achievements: { achievements: [] }, streak: null } } },
].map(testCase => ({ ...testCase, block: { ...testCase.block, read: { ...gamificationReadFixture, scope: {
  ...gamificationReadFixture.scope,
  include_profile: testCase.block.state.profile !== null,
  include_achievements: testCase.block.state.achievements !== null,
} } } }))
