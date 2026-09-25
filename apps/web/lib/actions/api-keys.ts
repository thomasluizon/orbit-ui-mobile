'use client'

import * as serverActions from '@/app/actions/api-keys'
import { bindAccountServerAction } from '@/lib/client-action'

export const createApiKey = bindAccountServerAction(serverActions.createApiKey)
export const revokeApiKey = bindAccountServerAction(serverActions.revokeApiKey)
