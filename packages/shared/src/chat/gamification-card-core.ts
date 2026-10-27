import type { GamificationCard } from '../types/chat'

export function gamificationCardTitleKey(card: GamificationCard): string {
  if (!card.state.profile) return 'progressScreen.sections.achievements'
  return card.state.achievements ? 'chat.gamificationCard.title' : 'chat.gamificationCard.levelTitle'
}
