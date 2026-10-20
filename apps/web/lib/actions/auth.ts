'use client'

import * as serverActions from '@/app/actions/auth'
import { bindServerAction } from '@/lib/client-action'

export const requestDeletion = bindServerAction(serverActions.requestDeletion)
export const confirmDeletion = bindServerAction(serverActions.confirmDeletion)
