import { randomUUID } from 'node:crypto'

const exportedHabit = (body) => ({ id: randomUUID(), title: body.title, description: body.description, emoji: null,
  isBadHabit: false, isGeneral: false, dueDate: body.startDate ? new Date().toISOString().slice(0, 10) : body.dueDate, startDate: body.startDate ?? body.dueDate, endDate: null, frequencyUnit: 'Day', frequencyQuantity: 1,
  days: [], checklistItems: [], createdAtUtc: '2026-10-01T00:00:00Z', logs: [], intervalWeeks: null })

// Daily recurrence behavior follows Habit, LogHabitCommand and SkipHabitArgumentChecks.
export function fixtureFetch(getState) {
  const undone = new Set()
  return async (url, options) => {
    const { habits, goals, tags, templates, requests, pro, exhausted, capacity, email } = getState()
    const path = new URL(url).pathname.slice(5)
    const body = options.body ? JSON.parse(options.body) : undefined
    const method = options.method
    requests.push({ path, method, body })
    if (options.headers['api-version'] !== '2.0') throw new Error('Expected API version.')
    if (path === 'auth/refresh') return Response.json({ token: 'pro-access', refreshToken: 'rotated-refresh' })
    if (!/^Bearer (pro|free|budget)-access$/.test(options.headers.Authorization)) throw new Error('Expected refreshed fixture access.')
    if (path === 'profile' && method === 'GET') return Response.json({ email, hasProAccess: pro, hasGoogleConnection: false, aiMessagesUsed: exhausted ? 50 : 0, aiMessagesLimit: 50 })
    if (path === 'profile/export') return Response.json({ exportedAtUtc: '2026-10-24T12:00:00Z', account: {}, settings: {}, subscription: {},
      habits: habits.filter((habit) => !habit.deleted).map(({ deleted, startDate, ...habit }) => habit), goals, tags, checklistTemplates: templates,
      notifications: [], achievements: [], streakFreezes: [], referrals: [], apiKeys: [], friendships: [], cheers: [], blockedUsers: [], reports: [], friendFeedEvents: [], proactiveItems: [], notionConnection: null, notionTasks: [], conversations: [] })
    if (['profile/timezone', 'profile/language', 'calendar/selected-calendars', 'calendar/auto-sync'].includes(path)) return new Response(null, { status: 204 })
    if (path === 'habits' && method === 'POST') {
      const habit = exportedHabit(body)
      habits.push(habit)
      return Response.json({ id: habit.id }, { status: 201 })
    }
    if (path === 'habits/bulk' && method === 'POST') {
      if (habits.filter((habit) => !habit.deleted).length + body.habits.length > capacity) return Response.json({ error: 'Capacity reached.', errorCode: 'HABIT_LIMIT_REACHED' }, { status: 400 })
      const results = body.habits.map((entry, index) => { const habit = exportedHabit(entry); habits.push(habit); return { index, status: 'Success', habitId: habit.id, title: habit.title, error: null, field: null, errorCode: null } })
      return Response.json({ results, applied_count: results.length, total_matched: results.length, skipped_count: 0, partial: false }, { status: 201 })
    }
    if (['goals', 'tags', 'checklist-templates'].includes(path) && method === 'POST') {
      const item = { id: randomUUID(), ...body }
      ;({ goals, tags, 'checklist-templates': templates })[path].push(item)
      return Response.json({ id: item.id }, { status: 201 })
    }
    const [resource, id, operation] = path.split('/')
    if (resource === 'habits') {
      const habit = habits.find((entry) => entry.id === id)
      if (!habit) throw new Error('Unknown habit at the HTTP boundary.')
      if (operation === 'restore') habit.deleted = false
      else if (operation === 'log') {
        const existing = habit.logs.findIndex((log) => log.date === body.date && log.value > 0)
        const today = new Date().toISOString().slice(0, 10)
        if (body.date > today || body.date < new Date(Date.parse(`${today}T12:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10)) return Response.json({ error: 'Outside log window.' }, { status: 400 })
        if (existing >= 0) { habit.logs.splice(existing, 1); habit.dueDate = body.date; undone.add(`${id}:${body.date}`) }
        else {
          if (body.date < habit.dueDate) return Response.json({ error: 'Not scheduled on date.' }, { status: 400 })
          habit.logs.push({ date: body.date, value: 1, note: null, createdAtUtc: new Date().toISOString() })
          if (body.date === today || (body.date === habit.dueDate && undone.has(`${id}:${body.date}`))) {
            do { habit.dueDate = new Date(Date.parse(`${habit.dueDate}T12:00:00Z`) + 86400000).toISOString().slice(0, 10) }
            while (habit.dueDate <= body.date || habit.logs.some((log) => log.date === habit.dueDate))
          }
        }
      } else if (operation === 'skip') {
        if (habit.dueDate > body.date) return Response.json({ error: 'Habit not yet due.' }, { status: 400 })
        habit.dueDate = new Date(Date.parse(`${body.date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
      } else if (method === 'PUT') {
        habit.title = body.title
        if (body.startDate && (body.startDate !== habit.startDate || body.frequencyUnit !== habit.frequencyUnit || body.frequencyQuantity !== habit.frequencyQuantity)) {
          habit.startDate = body.startDate
          habit.dueDate = new Date().toISOString().slice(0, 10)
        } else if (!body.startDate) habit.dueDate = body.dueDate ?? habit.dueDate
        habit.frequencyUnit = body.frequencyUnit
        habit.frequencyQuantity = body.frequencyQuantity
      }
      else if (method === 'DELETE') habit.deleted = true
      else throw new Error('Unexpected habit request.')
      return new Response(null, { status: 204 })
    }
    if (resource === 'tags' && operation === 'assign') return new Response(null, { status: 204 })
    if (method === 'DELETE' && ['goals', 'tags', 'checklist-templates'].includes(resource)) {
      const collection = ({ goals, tags, 'checklist-templates': templates })[resource]
      collection.splice(collection.findIndex((entry) => entry.id === id), 1)
      return new Response(null, { status: 204 })
    }
    throw new Error(`Unexpected intercepted fixture route: ${method} ${path}`)
  }
}
