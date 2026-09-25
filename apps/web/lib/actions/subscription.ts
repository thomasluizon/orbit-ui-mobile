'use client'

import * as serverActions from '@/app/actions/subscription'
import { bindAccountServerAction } from '@/lib/client-action'

export const openCustomerPortal = bindAccountServerAction(serverActions.openCustomerPortal)
