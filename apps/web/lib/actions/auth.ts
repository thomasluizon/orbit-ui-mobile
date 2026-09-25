'use client'

import * as serverActions from '@/app/actions/auth'
import { bindAccountServerAction } from '@/lib/client-action'

export const requestDeletion = bindAccountServerAction(serverActions.requestDeletion)
export const confirmDeletion = bindAccountServerAction(serverActions.confirmDeletion)
