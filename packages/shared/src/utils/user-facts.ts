export const USER_FACTS_PER_PAGE = 5

export type UserFactCategoryKey = 'preference' | 'routine' | 'context' | 'default'

export function normalizeUserFactCategory(category: string | null | undefined): UserFactCategoryKey {
  switch (category?.toLowerCase()) {
    case 'preference':
      return 'preference'
    case 'routine':
      return 'routine'
    case 'context':
      return 'context'
    default:
      return 'default'
  }
}
