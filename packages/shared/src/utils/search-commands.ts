export type SearchCommandPage = 'log' | 'skip' | null

const COMMANDS = [
  { id: 'create', group: 'create', label: 'command.createHabit' },
  { id: 'log', group: 'actions', label: 'command.logHabit' },
  { id: 'skip', group: 'actions', label: 'command.skipHabit' },
  { id: 'today', group: 'destinations', label: 'nav.today' },
  { id: 'calendar', group: 'destinations', label: 'nav.calendar' },
  { id: 'progress', group: 'destinations', label: 'nav.progress' },
  { id: 'profile', group: 'destinations', label: 'nav.profile' },
] as const

export type SearchCommandId = typeof COMMANDS[number]['id']

export function searchCommands(query: string, page: SearchCommandPage, translate: (key: string) => string): typeof COMMANDS[number][] {
  if (page) return []
  const needle = query.trim().toLocaleLowerCase()
  return COMMANDS.filter((command) => translate(command.label).toLocaleLowerCase().includes(needle))
}
