'use client'

import * as serverActions from '@/app/actions/subscription'
import { bindServerAction } from '@/lib/client-action'

export const openCustomerPortal = bindServerAction(serverActions.openCustomerPortal)
