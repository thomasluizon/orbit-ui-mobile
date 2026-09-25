'use client'

import * as serverActions from '@/app/actions/support'
import { bindAccountServerAction } from '@/lib/client-action'

export const sendSupportMessage = bindAccountServerAction(serverActions.sendSupportMessage)
