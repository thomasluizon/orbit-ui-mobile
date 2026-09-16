'use client'

import * as serverActions from '@/app/actions/uploads'
import { bindServerAction } from '@/lib/client-action'

export const signUpload = bindServerAction(serverActions.signUpload)
