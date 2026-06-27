/**
 * Local ESLint rule: keep `@gorhom/bottom-sheet` out of apps/mobile and route
 * every sheet through the shared wrapper.
 *
 * gorhom's `present()` + portal silently no-op on the New Architecture
 * (Fabric/Bridgeless) in release builds, so the bug is invisible at runtime.
 * This rule fails CI for the two reintroduction vectors:
 *  - importing `@gorhom/bottom-sheet` (anywhere), and
 *  - calling `.present()` / `.dismiss()` on a sheet ref (`someRef.current.present()`)
 *    outside the single sanctioned wrapper `components/bottom-sheet-modal.tsx`.
 */

const GORHOM_MODULE = '@gorhom/bottom-sheet'
const SHEET_METHODS = new Set(['present', 'dismiss'])
const ALLOWED_SHEET_FILE = 'components/bottom-sheet-modal.tsx'

function isCurrentMember(node) {
  return (
    node &&
    node.type === 'MemberExpression' &&
    node.property &&
    node.property.type === 'Identifier' &&
    node.property.name === 'current'
  )
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban @gorhom/bottom-sheet and direct sheet-ref present()/dismiss() calls outside the shared bottom-sheet wrapper.',
    },
    schema: [],
    messages: {
      noGorhomImport:
        "Don't import '@gorhom/bottom-sheet'. Its present()/portal no-op on the New Architecture in release builds — use the shared BottomSheetModal (components/bottom-sheet-modal.tsx, backed by react-native-true-sheet).",
      noSheetRefCall:
        'Route sheets through the shared BottomSheetModal wrapper. Calling {{method}}() on a sheet ref is only allowed in components/bottom-sheet-modal.tsx.',
    },
  },
  create(context) {
    const rawFilename = context.filename ?? context.getFilename() ?? ''
    const filename = rawFilename.replace(/\\/g, '/')
    const isWrapperFile = filename.endsWith(ALLOWED_SHEET_FILE)

    function reportGorhomSource(node) {
      if (node && node.value === GORHOM_MODULE) {
        context.report({ node, messageId: 'noGorhomImport' })
      }
    }

    return {
      ImportDeclaration(node) {
        reportGorhomSource(node.source)
      },
      ImportExpression(node) {
        reportGorhomSource(node.source)
      },
      CallExpression(node) {
        const callee = node.callee

        if (callee.type !== 'MemberExpression') {
          if (
            callee.type === 'Identifier' &&
            callee.name === 'require' &&
            node.arguments.length === 1 &&
            node.arguments[0].type === 'Literal'
          ) {
            reportGorhomSource(node.arguments[0])
          }
          return
        }

        if (isWrapperFile) return

        const property = callee.property
        if (
          property &&
          property.type === 'Identifier' &&
          SHEET_METHODS.has(property.name) &&
          isCurrentMember(callee.object)
        ) {
          context.report({
            node,
            messageId: 'noSheetRefCall',
            data: { method: property.name },
          })
        }
      },
    }
  },
}
