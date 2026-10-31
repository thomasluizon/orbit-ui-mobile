import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../..')
const containers = new Set(['Sheet', 'FlowShell', 'Shell412', 'HabitCreateFrame', 'HabitList', 'HabitDrill', 'KeyboardAwareScrollHost', 'ShellBottomViewport', 'FlowViewport', 'KeyboardAwareScrollView', 'KeyboardAwareSheetScrollView', 'KeyboardAwareFlatList'])
const fields = new Set(['TextInput', 'TypedTextInput', 'AppTextInput', 'BottomSheetAppTextInput', 'Input', 'OtpInput'])

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? sourceFiles(join(directory, entry.name))
    : entry.name.endsWith('.tsx') && !entry.name.endsWith('type-test.tsx') ? [join(directory, entry.name)] : [])
}

function importPath(file: string, specifier: string) {
  const base = specifier.startsWith('@/') ? join(root, specifier.slice(2)) : resolve(dirname(file), specifier)
  return [base + '.tsx', base + '.ts', join(base, 'index.tsx')].find(existsSync)
}

function componentOwner(node: ts.Node): string | undefined {
  for (let parent = node.parent; !ts.isSourceFile(parent); parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent)) {
      if (parent.name) return parent.name.text
    }
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text
  }
}

function locallyCovered(node: ts.Node) {
  for (let parent = node.parent; !ts.isSourceFile(parent); parent = parent.parent) {
    if (ts.isJsxElement(parent) && containers.has(parent.openingElement.tagName.getText())) return true
    if (ts.isJsxSelfClosingElement(parent) && containers.has(parent.tagName.getText())) return true
    if (ts.isCallExpression(parent) && parent.expression.getText() === 'useShellHeader') return true
  }
  return false
}

function inventory(entries = ['app', 'components'].flatMap(directory => sourceFiles(join(root, directory)))
  .map(file => [file, readFileSync(file, 'utf8')] as const)) {
  const uses = new Map<string, ts.Node[]>()
  const inputs: ts.Node[] = []
  const slots: ts.JsxExpression[] = []
  for (const [file, contents] of entries) {
    const source = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const imports = new Map<string, string>()
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      const bindings = statement.importClause?.namedBindings
      if (!bindings || !ts.isNamedImports(bindings)) continue
      const target = importPath(file, statement.moduleSpecifier.text)
      for (const binding of bindings.elements) imports.set(binding.name.text, `${target ?? statement.moduleSpecifier.text}#${binding.propertyName?.text ?? binding.name.text}`)
    }
    const visit = (node: ts.Node) => {
      if (ts.isTypeNode(node) || ts.isImportDeclaration(node)) return
      if (ts.isJsxExpression(node)) slots.push(node)
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        const name = node.tagName.getText()
        if (fields.has(name.split('.').at(-1)!) || fields.has(imports.get(name)?.split('#')[1] ?? '')) inputs.push(node)
        const key = imports.get(name) ?? `${file}#${name}`
        uses.set(key, [...uses.get(key) ?? [], node])
      }
      if (ts.isIdentifier(node) && (ts.isJsxExpression(node.parent)
        || ts.isSpreadAssignment(node.parent)
        || ts.isJsxSpreadAttribute(node.parent)
        || ts.isCallExpression(node.parent) && (node.parent.expression === node || node.parent.arguments.includes(node))
        || ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node
        || ts.isReturnStatement(node.parent)
        || ts.isConditionalExpression(node.parent)
        || ts.isElementAccessExpression(node.parent) && node.parent.expression === node)) {
        const key = imports.get(node.text) ?? `${file}#${node.text}`
        uses.set(key, [...uses.get(key) ?? [], node])
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  const covered = (node: ts.Node, seen = new Set<string>()): boolean => {
    if (locallyCovered(node)) return true
    const owner = componentOwner(node)
    const key = `${node.getSourceFile().fileName}#${owner}`
    if (seen.has(key)) return true
    if (!owner) return false
    const callers = uses.get(key) ?? []
    return callers.length > 0 && callers.every(caller => covered(caller, new Set([...seen, key])))
  }
  const failurePath = (node: ts.Node, seen = new Set<string>()): string => {
    const key = `${node.getSourceFile().fileName}#${componentOwner(node)}`
    if (seen.has(key)) return ''
    const caller = (uses.get(key) ?? []).find(candidate => !covered(candidate, new Set([...seen, key])))
    return `${relative(root, key)}${caller ? ' -> ' + failurePath(caller, new Set([...seen, key])) : ''}`
  }
  return { inputs, covered, failurePath, slots }
}

describe('Mobile text input keyboard inventory', () => {
  it('keeps every input owner below shared keyboard scrolling', () => {
    const { inputs, covered, failurePath } = inventory()
    expect(inputs.length).toBeGreaterThan(50)
    const uncovered = inputs.filter(node => !covered(node)).map(node => {
      const source = node.getSourceFile()
      return `${relative(root, source.fileName)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${failurePath(node)}`
    })
    expect(uncovered).toEqual([])
  })

  it('rejects a field moved outside its host, including aliased inputs', () => {
    const wrapped = "import { Input as Field } from '@/components/ui/input'; function Form() { return <KeyboardAwareScrollView><Field /></KeyboardAwareScrollView> }"
    const inside = inventory([[join(root, 'form.tsx'), wrapped]])
    expect(inside.inputs).toHaveLength(1)
    expect(inside.covered(inside.inputs[0]!)).toBe(true)
    const outside = inventory([[join(root, 'form.tsx'), wrapped.replaceAll('KeyboardAwareScrollView', 'View')]])
    expect(outside.inputs).toHaveLength(1)
    expect(outside.covered(outside.inputs[0]!)).toBe(false)
  })

  it.each([
    ['object spread', '<Preview render={{ ...pendingOperationRenderers }} />'],
    ['JSX attribute spread', '<Preview {...pendingOperationRenderers} />'],
  ])('tracks renderer callers through %s', (_name, preview) => {
    const renderers = 'const pendingOperationRenderers = { title: () => <Input /> };'
    const wrapped = `${renderers} function Form() { return <KeyboardAwareScrollView>${preview}</KeyboardAwareScrollView> }`
    const inside = inventory([[join(root, 'form.tsx'), wrapped]])
    expect(inside.inputs).toHaveLength(1)
    expect(inside.covered(inside.inputs[0]!)).toBe(true)
    const outside = inventory([[join(root, 'form.tsx'), wrapped.replaceAll('KeyboardAwareScrollView', 'View')]])
    expect(outside.inputs).toHaveLength(1)
    expect(outside.covered(outside.inputs[0]!)).toBe(false)
    const mixed = inventory([[join(root, 'form.tsx'), `${wrapped} function OtherForm() { return <View>${preview}</View> }`]])
    expect(mixed.inputs).toHaveLength(1)
    expect(mixed.covered(mixed.inputs[0]!)).toBe(false)
  })

  it('keeps adapter content and shell slots under their keyboard scroll hosts', () => {
    const { slots, covered, failurePath } = inventory()
    const seams = [
      ['components/shell/flow-shell.tsx', 'FlowShell', 'children'],
      ['components/shell/shell-412.tsx', 'ShellBottomViewport', 'children'],
      ['components/shell/shell-412.tsx', 'FlowViewport', 'children'],
      ['components/shell/shell-412.tsx', 'ShellBottomChrome', 'navigationEnabled ? pinnedSlot : <ShellContent>{pinnedSlot}</ShellContent>'],
      ['components/habits/habit-create-frame.tsx', 'HabitCreateScreenFrame', 'props.children'],
      ['components/habit-list.tsx', 'listHeaderComponent', 'listHeader'],
      ['components/habit-list/habit-drill.tsx', 'header', 'listHeaderComponent'],
    ]
    for (const [file, owner, expression] of seams) {
      const slot = slots.find(node => relative(root, node.getSourceFile().fileName) === file
        && componentOwner(node) === owner && node.expression?.getText() === expression)
      expect(slot, `${file} ${owner} ${expression}`).toBeDefined()
      expect(covered(slot!), failurePath(slot!)).toBe(true)
    }
  })
})
