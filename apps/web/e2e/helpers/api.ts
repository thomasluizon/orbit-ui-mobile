import { type APIRequestContext } from '@playwright/test'

const API_URL = process.env.E2E_API_URL || 'http://127.0.0.1:5000'

export function getDateRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 6, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 6, 0)
  return {
    dateFrom: from.toISOString().split('T')[0],
    dateTo: to.toISOString().split('T')[0],
  }
}

async function safeJson(res: { json: () => Promise<unknown>; ok: () => boolean; status: () => number; text: () => Promise<string> }) {
  if (!res.ok()) {
    const text = await res.text()
    throw new Error(`API ${res.status()}: ${text}`)
  }
  const text = await res.text()
  if (!text) return {}
  return JSON.parse(text)
}

export function createAPIHelper(request: APIRequestContext, token: string) {
  const headers = { Authorization: `Bearer ${token}` }

  return {
    // Habits
    async getHabits(dateFrom: string, dateTo: string) {
      const res = await request.get(`${API_URL}/api/habits?dateFrom=${dateFrom}&dateTo=${dateTo}&pageSize=100`, { headers })
      return safeJson(res)
    },

    async createHabit(data: Record<string, unknown>) {
      const res = await request.post(`${API_URL}/api/habits`, { headers, data })
      return safeJson(res)
    },

    async deleteHabit(id: string) {
      await request.delete(`${API_URL}/api/habits/${id}`, { headers })
    },

    async bulkDeleteHabits(habitIds: string[]) {
      if (habitIds.length === 0) return
      await request.delete(`${API_URL}/api/habits/bulk`, { headers, data: { habitIds } })
    },

    async logHabit(id: string, note?: string) {
      const res = await request.post(`${API_URL}/api/habits/${id}/log`, { headers, data: { note } })
      return safeJson(res)
    },

    async skipHabit(id: string) {
      const res = await request.post(`${API_URL}/api/habits/${id}/skip`, { headers })
      return safeJson(res)
    },

    // Tags
    async getTags() {
      const res = await request.get(`${API_URL}/api/tags`, { headers })
      return safeJson(res)
    },

    async createTag(name: string, color: string) {
      const res = await request.post(`${API_URL}/api/tags`, { headers, data: { name, color } })
      return safeJson(res)
    },

    async deleteTag(id: string) {
      await request.delete(`${API_URL}/api/tags/${id}`, { headers })
    },

    // User Facts
    async getFacts() {
      const res = await request.get(`${API_URL}/api/user-facts`, { headers })
      return safeJson(res)
    },

    async deleteFact(id: string) {
      await request.delete(`${API_URL}/api/user-facts/${id}`, { headers })
    },

    async bulkDeleteFacts(factIds: string[]) {
      if (factIds.length === 0) return
      await request.delete(`${API_URL}/api/user-facts/bulk`, { headers, data: { factIds } })
    },

    // Notifications
    async clearNotifications() {
      await request.delete(`${API_URL}/api/notifications/all`, { headers })
    },

    // Profile
    async getProfile() {
      const res = await request.get(`${API_URL}/api/profile`, { headers })
      return safeJson(res)
    },

    async updateTimezone(timeZone: string) {
      await request.put(`${API_URL}/api/profile/timezone`, { headers, data: { timeZone } })
    },

    async updateLanguage(language: string) {
      await request.put(`${API_URL}/api/profile/language`, { headers, data: { language } })
    },

    // Goals
    async getGoals() {
      const res = await request.get(`${API_URL}/api/goals?pageSize=100`, { headers })
      return safeJson(res)
    },

    async createGoal(data: Record<string, unknown>) {
      const res = await request.post(`${API_URL}/api/goals`, { headers, data })
      return safeJson(res)
    },

    async deleteGoal(id: string) {
      await request.delete(`${API_URL}/api/goals/${id}`, { headers })
    },
  }
}
