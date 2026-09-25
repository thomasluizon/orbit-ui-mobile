'use client'

import * as serverActions from '@/app/actions/uploads'
import { bindAccountServerAction } from '@/lib/client-action'

export const signUpload = bindAccountServerAction(serverActions.signUpload)
