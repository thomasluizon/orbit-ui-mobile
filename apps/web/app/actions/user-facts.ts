'use server'

import { API } from '@orbit/shared/api'
import { serverAuthFetch } from '@/lib/server-fetch'

export async function deleteUserFact(factId: string): Promise<void> {
  await serverAuthFetch(API.userFacts.delete(factId), { method: 'DELETE' })
}

export async function bulkDeleteUserFacts(ids: string[]): Promise<void> {
  await serverAuthFetch(API.userFacts.bulk, {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  })
}
