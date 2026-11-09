export class NativeTreePendingError extends Error {}

function isWebViewRuntimeRoot(node, byId) {
  const ancestry = [
    ['Chrome', 'EmbeddedBrowserTabRootView', 'Pane'],
    ['Chrome', 'NonClientView', 'Pane'],
    ['Chrome', 'BrowserRootView', 'Pane'],
    ['Win32', 'Chrome_WidgetWin_1', 'Pane'],
    ['Win32', 'Chrome_WidgetWin_0', 'Pane'],
    ['Win32', 'WRY_WEBVIEW', 'Pane'],
    ['Win32', 'Tauri Window', 'Window'],
  ]
  let ancestor = node
  return ancestry.every(([framework, className, role]) => {
    if (ancestor?.FrameworkId !== framework || ancestor.ClassName !== className || ancestor.role !== role) return false
    ancestor = byId.get(ancestor.id.slice(0, ancestor.id.lastIndexOf('/')))
    return true
  })
}

export function assertAccessibleTree(tree, platform) {
  if (tree.denied) {
    if (platform !== 'darwin' || !tree.error) throw new Error('Only an explicit macOS accessibility denial may be skipped')
    return { skipped: tree.error }
  }
  if (tree.error) throw new Error(`Native accessibility capture failed: ${tree.error}; ${JSON.stringify(tree.failure)}`)
  const webRoles = platform === 'darwin' ? ['AXWebArea'] : ['Document']
  const documents = tree.nodes.filter((node) => webRoles.includes(node.role))
  if (!documents.length) throw new NativeTreePendingError('Native tree contains no web content')
  const byId = new Map(tree.nodes.map((node) => [node.id, node]))
  // UIA raw-only nodes are absent from both assistive views: https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-treeoverview
  // IsOffscreen identifies controls scrolled or collapsed out of view: https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.automationelement.automationelementinformation.isoffscreen
  // WebView2's automation provider is read-only; exclude only its native runtime root (#1560): https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2compositioncontroller2
  const controls = tree.nodes.filter((node) => node.interactive && !(platform === 'win32' &&
    (node.IsOffscreen === true || node.IsControlElement === false && node.IsContentElement === false || isWebViewRuntimeRoot(node, byId))))
  if (!controls.length) throw new NativeTreePendingError('Native tree contains no interactive controls')
  const invalid = controls.filter((node) => !node.name?.trim() || !node.role || ['Custom', 'AXUnknown'].includes(node.role))
  if (invalid.length) throw new Error(`Interactive controls require role and name: ${JSON.stringify(invalid)}`)
  if (!controls.some((node) => documents.some((document) => node.id.startsWith(`${document.id}/`)))) {
    throw new NativeTreePendingError('Native web content contains no interactive controls')
  }
  return { controls: controls.length }
}

export function assertPaletteFocus(previous, current, tree) {
  if (!previous.inputFocused || !current.inputFocused || current.results.length < 2) throw new Error('Palette must retain keyboard focus in its input')
  const expected = previous.selected + 1
  if (expected >= current.results.length || current.selected !== expected) throw new Error(`Palette result order: expected ${expected}, received ${current.selected}`)
  const focused = tree.nodes.filter((node) => node.focused)
  const selectedName = current.results[current.selected]
  const inputFocused = focused.some((node) => ['Edit', 'ComboBox', 'AXTextField', 'AXComboBox'].includes(node.role) && node.name === current.inputName)
  const listbox = current.listId && tree.nodes.find((node) => node.role === 'List' && node.AutomationId === current.listId)
  // Chromium exposes the active descendant as platform focus while DOM focus stays in the input (#1560).
  const descendantFocused = listbox && current.activeDescendantId && focused.some((node) => node.role === 'ListItem' &&
    node.AutomationId === current.activeDescendantId && node.name === selectedName && node.selected && node.id.startsWith(`${listbox.id}/`))
  if (!inputFocused && !descendantFocused) {
    throw new Error('Platform accessibility tree does not expose focus on the palette input or its selected active descendant')
  }
  if (!tree.nodes.some((node) => node.name === selectedName && (node.selected || node.focused))) {
    throw new Error(`Platform accessibility tree does not expose selected palette result: ${selectedName}`)
  }
}

export function corruptSignature(signature) {
  const lines = Buffer.from(signature, 'base64').toString('utf8').trim().split(/\r?\n/)
  if (lines.length !== 4) throw new Error('Expected the Tauri signer minisign envelope')
  const signed = Buffer.from(lines[1], 'base64')
  if (signed.length !== 74) throw new Error('Expected the Tauri signer signature length')
  signed[10] ^= 1
  lines[1] = signed.toString('base64')
  return Buffer.from(`${lines.join('\n')}\n`).toString('base64')
}

export function assertCookieEvidence(cookies, authenticated) {
  for (const name of ['auth_token', 'refresh_token']) {
    const cookie = cookies.find((entry) => entry.startsWith(`${name}=`))
    if (!cookie || !/;\s*HttpOnly(?:;|$)/i.test(cookie) || !/;\s*Secure(?:;|$)/i.test(cookie) || !/;\s*SameSite=Strict(?:;|$)/i.test(cookie)) {
      throw new Error(`Email BFF must set a secure httpOnly strict ${name} cookie`)
    }
  }
  if (!authenticated) throw new Error('The installed webview did not send its BFF session cookie')
}

export function visibleWindows(platform, reply) {
  if (!Array.isArray(reply?.windows)) throw new Error(`Native reader returned no window list: ${JSON.stringify(reply)}`)
  // Tauri registers its webview windows under this class; tray and dialog windows use other classes.
  return reply.windows.filter((window) => platform === 'win32'
    ? window.visible === true && window.className === 'Tauri Window'
    : window.onscreen === true && window.layer === 0).length
}

function habitLogs(logs, habitId) {
  return logs.filter((log) => log.habitId === habitId).length
}

export function assertDoneDelivered({ logs, habitId, visible }) {
  const count = habitLogs(logs, habitId)
  if (count !== 1) throw new Error(`Done must record exactly one habit log; the API recorded ${count}`)
  if (visible !== 0) throw new Error(`Done must leave the app window hidden; ${visible} window(s) became visible`)
  return { logs: 1, windowVisible: false }
}

// Sign-in paths match apps/desktop/src-tauri/src/auth.rs is_sign_in_path.
const signInPaths = ['/login', '/auth-callback', '/onboarding']

export function assertExpiredDone({ logs, habitId, visible, signIn }) {
  const count = habitLogs(logs, habitId)
  if (count !== 0) throw new Error(`An expired-session Done must record no habit log; the API recorded ${count}`)
  if (visible < 1) throw new Error('An expired-session Done must leave the sign-in window visible')
  if (!signInPaths.includes(signIn?.route)) throw new Error(`An expired-session Done must open the sign-in page, not ${signIn?.route}`)
  return { logs: 0, windowVisible: true, route: signIn.route }
}
