export function assertAccessibleTree(tree, platform) {
  if (tree.denied) {
    if (platform !== 'darwin' || !tree.error) throw new Error('Only an explicit macOS accessibility denial may be skipped')
    return { skipped: tree.error }
  }
  if (tree.error) throw new Error(`Native accessibility capture failed: ${tree.error}; ${JSON.stringify(tree.failure)}`)
  const webRoles = platform === 'darwin' ? ['AXWebArea'] : ['Document']
  const documents = tree.nodes.filter((node) => webRoles.includes(node.role))
  if (!documents.length) throw new Error('Native tree contains no web content')
  // UIA raw-only nodes are absent from both assistive views: https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-treeoverview
  const controls = tree.nodes.filter((node) => node.interactive && !(platform === 'win32' && node.IsControlElement === false && node.IsContentElement === false))
  if (!controls.length) throw new Error('Native tree contains no interactive controls')
  const invalid = controls.filter((node) => !node.name?.trim() || !node.role || ['Custom', 'AXUnknown'].includes(node.role))
  if (invalid.length) throw new Error(`Interactive controls require role and name: ${JSON.stringify(invalid)}`)
  if (!controls.some((node) => documents.some((document) => node.id.startsWith(`${document.id}/`)))) {
    throw new Error('Native web content contains no interactive controls')
  }
  return { controls: controls.length }
}

export function assertPaletteFocus(previous, current, tree) {
  if (!previous.inputFocused || !current.inputFocused || current.results.length < 2) throw new Error('Palette must retain keyboard focus in its input')
  const expected = previous.selected + 1
  if (expected >= current.results.length || current.selected !== expected) throw new Error(`Palette result order: expected ${expected}, received ${current.selected}`)
  const focused = tree.nodes.filter((node) => node.focused)
  if (!focused.some((node) => ['Edit', 'ComboBox', 'AXTextField', 'AXComboBox'].includes(node.role) && node.name === current.inputName)) {
    throw new Error('Platform accessibility tree does not expose focused palette input')
  }
  const selectedName = current.results[current.selected]
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
