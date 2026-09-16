'use client'

import * as serverActions from '@/app/actions/support'
import { bindServerAction } from '@/lib/client-action'

export const sendSupportMessage = bindServerAction(serverActions.sendSupportMessage)
