import type { LockupProps } from './Lockup'

const acceptLockup = (_props: LockupProps): void => undefined

acceptLockup({})

// @ts-expect-error the lockup cannot be resized
acceptLockup({ size: 28 })
// @ts-expect-error the lockup cannot be restyled with a class
acceptLockup({ className: 'large' })
// @ts-expect-error the lockup cannot be restyled inline
acceptLockup({ style: {} })
