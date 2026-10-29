import { registerChromeLaunchHook } from '@/__tests__/support/chromium'
import { sidebarBrandAccountGeometry } from '@/__tests__/support/sidebar-brand-account-geometry'

sidebarBrandAccountGeometry(true, registerChromeLaunchHook, [320, 360, 384, 412, 768, 1023])
