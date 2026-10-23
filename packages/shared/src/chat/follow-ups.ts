import type { ChatFollowUp, ChatMessage } from '../types/chat'

export function getChatFollowUps(message: Pick<ChatMessage, 'followUps' | 'followUpContext'>): ChatFollowUp[] {
  const contextual = message.followUpContext?.filter(item => item !== null) ?? []
  const candidates = contextual.length ? contextual : (message.followUps ?? [])
    .filter(question => question.trim().length > 0 && question.length <= 40)
    .map(question => ({ label: question, question }))
  const questions = new Set<string>()
  return candidates.filter(item => {
    if (/\.{3}$|…$/.test(item.label)) return false
    if (questions.has(item.question)) return false
    questions.add(item.question)
    return true
  }).slice(0, 2)
}
