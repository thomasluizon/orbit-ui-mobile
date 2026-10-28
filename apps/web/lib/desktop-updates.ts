import { z } from 'zod'
import { captureException } from '@sentry/nextjs'
import { desktopRuntime } from './desktop-runtime'
import { canReloadDesktopWeb, reloadDesktopWeb, watchDesktopWebRelease, type desktopWebReleaseSchema, shellSupportsWeb } from './desktop-web-release'
import { forgetDesktopChatCheckpoint } from './web-reload-state'
import { useDesktopUpdateStore, type DesktopUpdateNotice } from '@/stores/desktop-update-store'

const nativeSnapshotSchema = z.object({
  phase: z.enum(['idle', 'available', 'downloading', 'downloaded', 'installing', 'failed']),
  shellVersion: z.string().nullable(), webCommit: z.string().nullable(), deferred: z.boolean(),
  restartRequested: z.boolean(), checking: z.boolean(), checkFailed: z.boolean(),
  promptPending: z.boolean().optional().default(false),
})
type NativeSnapshot = z.infer<typeof nativeSnapshotSchema>
type WebRelease = z.infer<typeof desktopWebReleaseSchema>

export function desktopOffersSupported() {
  return (window as Window & { __ORBIT_DESKTOP_UPDATES__?: unknown }).__ORBIT_DESKTOP_UPDATES__ === true
}

async function invoke(action: 'status' | 'web-release' | 'defer' | 'download' | 'install' | 'cancel' | 'release', options: { commit?: string | null; reservation?: string } = {}) {
  const runtime = desktopRuntime()
  if (!runtime) throw new Error('Desktop update runtime unavailable')
  return nativeSnapshotSchema.parse(await runtime.invoke('desktop_update', { action, ...options }))
}

class DesktopUpdateController {
  stopped = false
  native: NativeSnapshot | null = null
  web: WebRelease | null = null
  deferred: string | null = null
  requested = false
  applying = false
  polling = false
  failed = false
  supported = desktopOffersSupported()
  readonly reservation = crypto.randomUUID()

  constructor(readonly version: string, readonly commit: string | null, readonly requireUpgrade: (minimum: string) => void) {}

  isStopped() { return this.stopped }

  shellInstallationPaused() { return this.native?.promptPending || this.native?.deferred }

  offerKey() { return JSON.stringify([this.native?.shellVersion, this.web?.commit, this.web?.minimumShellVersion]) }

  publish() {
    if (this.stopped) return
    const kind = this.native?.shellVersion ? 'shell' : this.web ? 'web' : null
    const hidden = this.native?.deferred || this.deferred === this.offerKey()
    const phase: DesktopUpdateNotice['phase'] = this.failed || this.native?.phase === 'failed' ? 'failed'
      : this.native?.phase === 'installing' ? 'installing'
      : this.applying || this.native?.phase === 'downloading' ? 'downloading' : 'available'
    const safe = canReloadDesktopWeb()
    const notice: DesktopUpdateNotice | null = kind && !hidden && !this.native?.promptPending && (safe || phase === 'downloading' || phase === 'installing') ? { kind, phase } : null
    const previous = useDesktopUpdateStore.getState().notice
    if (previous?.kind !== notice?.kind || previous?.phase !== notice?.phase) useDesktopUpdateStore.setState({ notice })
  }

  async finish() {
    if (this.stopped) { forgetDesktopChatCheckpoint(); return }
    if (this.native?.shellVersion) {
      this.requested = false
      this.native = { ...this.native, phase: 'installing' }
      this.publish()
      this.native = await invoke('install')
      if (this.native.phase === 'failed') { forgetDesktopChatCheckpoint(); this.requested = false }
    } else if (this.web && !shellSupportsWeb(this.version, this.web.minimumShellVersion)) {
      this.requireUpgrade(this.web.minimumShellVersion)
      this.requested = false
    } else {
      globalThis.location.reload()
      this.requested = false
    }
  }

  async downloadShell() {
    this.publish()
    this.native = await invoke('download', { reservation: this.reservation })
    if (this.isStopped()) return false
    if (this.native.phase === 'failed' || this.shellInstallationPaused()) { this.requested = false; return false }
    return true
  }

  async apply() {
    if (this.stopped || this.applying || !this.requested || !canReloadDesktopWeb()) return
    if (this.shellInstallationPaused()) { this.requested = false; return }
    this.applying = true
    this.failed = false
    try {
      if (this.native?.shellVersion && !await this.downloadShell()) return
      if (!canReloadDesktopWeb() || this.isStopped()) return
      await reloadDesktopWeb(() => this.finish(), Boolean(this.native?.shellVersion))
    } catch (error) {
      this.requested = false
      this.failed = true
      captureException(error)
      try { forgetDesktopChatCheckpoint() } catch (storageError) { captureException(storageError) }
    } finally {
      if (this.native?.shellVersion && (this.isStopped() || this.failed)) {
        try { this.native = await invoke('release', { reservation: this.reservation }) } catch (error) { captureException(error) }
      }
      this.applying = false
      this.publish()
    }
  }

  async poll() {
    if (this.polling || this.stopped) return
    this.polling = true
    try {
      if (this.supported) {
        this.native = await invoke('status')
        if (this.commit !== null && this.native.webCommit === this.commit) this.native = await invoke('web-release', { commit: null })
        if (!this.isStopped() && this.native.restartRequested) {
          this.requested = true
          this.native = await invoke('cancel')
        }
      }
      this.publish()
      await this.apply()
    } catch (error) { captureException(error) }
    finally { this.polling = false }
  }

  async later() {
    this.deferred = this.offerKey()
    this.requested = false
    this.failed = false
    this.publish()
    try {
      if (this.supported) {
        this.native = await invoke('defer')
        this.deferred = null
      }
    }
    catch (error) { this.deferred = null; this.failed = true; captureException(error) }
    this.publish()
  }

  async receiveWeb(release: WebRelease) {
    this.web = release
    this.failed = false
    try {
      if (this.supported) this.native = await invoke('web-release', { commit: release.commit === this.commit ? null : release.commit })
    } catch (error) { this.failed = true; captureException(error) }
    this.publish()
  }
}

export function watchDesktopUpdates(version: string, commit: string | null, requireUpgrade: (minimum: string) => void) {
  const controller = new DesktopUpdateController(version, commit, requireUpgrade)
  const poll = () => { void controller.poll() }
  useDesktopUpdateStore.setState({
    restart: () => { controller.requested = true; void controller.apply() },
    later: () => { void controller.later() },
  })
  const stopWeb = watchDesktopWebRelease(version, commit, release => { void controller.receiveWeb(release) })
  poll()
  const timer = setInterval(poll, 1000)
  window.addEventListener('focus', poll)
  return () => {
    controller.stopped = true
    if (controller.supported && controller.native?.shellVersion) {
      void invoke('release', { reservation: controller.reservation }).catch(error => { captureException(error) })
    }
    stopWeb()
    clearInterval(timer)
    window.removeEventListener('focus', poll)
    useDesktopUpdateStore.setState({ notice: null, restart: null, later: null })
  }
}
