'use client'

import * as serverActions from '@/app/actions/api-keys'
import { bindServerAction } from '@/lib/client-action'

export const createApiKey = bindServerAction(serverActions.createApiKey)
export const revokeApiKey = bindServerAction(serverActions.revokeApiKey)
