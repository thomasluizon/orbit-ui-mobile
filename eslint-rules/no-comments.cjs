const DIRECTIVE =
  /^(eslint-disable|eslint-enable|eslint-disable-line|eslint-disable-next-line|eslint-env|global\s|globals\s|exported\s|@ts-|ts-|prettier-ignore|@jsx|c8\s|v8\s|istanbul\s|webpack|@vite|@vitest|@__PURE__|#__PURE__|@license|@preserve)/
const URL_RE = /https?:\/\//
const DOC_PRAGMA = /^@(?:jsx|vitest-environment|license|preserve)/
const TYPE_ANNOTATION = /^@(?:(?:type|typedef|satisfies|template|import)\b|(?:param|returns?)\s*\{)/
const JAVASCRIPT_FILE = /\.[cm]?jsx?$/
const EXPORT_DECLARATIONS = new Set([
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
  'ExportAllDeclaration',
  'TSExportAssignment',
  'TSNamespaceExportDeclaration',
])
const NAMED_DECLARATIONS = new Set([
  'FunctionDeclaration',
  'TSDeclareFunction',
  'ClassDeclaration',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSEnumDeclaration',
  'TSModuleDeclaration',
])
const MEMBERS = new Set([
  'Property',
  'MethodDefinition',
  'PropertyDefinition',
  'AccessorProperty',
  'TSAbstractMethodDefinition',
  'TSAbstractPropertyDefinition',
  'TSAbstractAccessorProperty',
  'TSPropertySignature',
  'TSMethodSignature',
  'TSIndexSignature',
  'TSCallSignatureDeclaration',
  'TSConstructSignatureDeclaration',
  'TSEnumMember',
])
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])

function docLines(comment) {
  return comment.value.split('\n').map((line) => line.replace(/^[\s*]+/, ''))
}

function isDocDirective(comment, filename) {
  const lines = docLines(comment)
  if (DIRECTIVE.test(lines.find((line) => line !== '') ?? '')) return true
  if (lines.some((line) => DOC_PRAGMA.test(line))) return true
  return JAVASCRIPT_FILE.test(filename) && lines.some((line) => TYPE_ANNOTATION.test(line))
}

function bindingNames(pattern) {
  if (!pattern) return []
  if (pattern.type === 'Identifier') return [pattern.name]
  if (pattern.type === 'ObjectPattern') return pattern.properties.flatMap((property) => bindingNames(property.value ?? property.argument))
  if (pattern.type === 'ArrayPattern') return pattern.elements.flatMap(bindingNames)
  if (pattern.type === 'AssignmentPattern') return bindingNames(pattern.left)
  if (pattern.type === 'RestElement') return bindingNames(pattern.argument)
  return []
}

function declaredNames(statement) {
  if (statement.type === 'VariableDeclaration') return statement.declarations.flatMap((declarator) => bindingNames(declarator.id))
  if (NAMED_DECLARATIONS.has(statement.type) && statement.id?.type === 'Identifier') return [statement.id.name]
  return []
}

function locallyExportedNames(program) {
  const names = new Set()
  for (const statement of program.body) {
    if (statement.type === 'ExportNamedDeclaration' && !statement.source) {
      for (const specifier of statement.specifiers) names.add(specifier.local.name)
    }
    if (
      (statement.type === 'ExportDefaultDeclaration' && statement.declaration.type === 'Identifier') ||
      (statement.type === 'TSExportAssignment' && statement.expression.type === 'Identifier')
    ) {
      names.add((statement.declaration ?? statement.expression).name)
    }
  }
  return names
}

function isCommonJsExportTarget(node) {
  if (node.type === 'Identifier') return node.name === 'exports'
  if (node.type !== 'MemberExpression') return false
  if (node.object.type === 'Identifier' && node.object.name === 'module') {
    return node.property.type === 'Identifier' && node.property.name === 'exports' && !node.computed
  }
  return isCommonJsExportTarget(node.object)
}

function isCommonJsExport(statement) {
  return (
    statement.type === 'ExpressionStatement' &&
    statement.expression.type === 'AssignmentExpression' &&
    statement.expression.left.type === 'MemberExpression' &&
    isCommonJsExportTarget(statement.expression.left)
  )
}

function isExportedStatement(statement, exportedNames) {
  if (EXPORT_DECLARATIONS.has(statement.type) || isCommonJsExport(statement)) return true
  return statement.parent.type === 'Program' && declaredNames(statement).some((name) => exportedNames.has(name))
}

function isOnExportedSymbol(node, exportedNames) {
  if (!MEMBERS.has(node.type)) return isExportedStatement(node, exportedNames)
  let child = node
  for (let ancestor = node.parent; ancestor.type !== 'Program'; child = ancestor, ancestor = ancestor.parent) {
    if (ancestor.type === 'StaticBlock' || (FUNCTIONS.has(ancestor.type) && ancestor.body === child)) return false
    if (EXPORT_DECLARATIONS.has(ancestor.type)) return true
  }
  return isExportedStatement(child, exportedNames)
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow comments except JSDoc on an exported symbol, tooling directives, and WHY notes that link an upstream URL.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      noComment:
        'Remove this comment. Only a /** */ JSDoc on an exported symbol, a tooling directive, or a WHY note that links an upstream URL is allowed. Rename or extract instead of narrating.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()
    const outermostNodeAt = new Map()

    function emptyJsxContainer(comment) {
      const before = sourceCode.getTokenBefore(comment)
      const after = sourceCode.getTokenAfter(comment)
      const container = before && outermostNodeAt.get(before.range[0])
      const holdsOnlyThisComment =
        container?.type === 'JSXExpressionContainer' &&
        container.range[1] === after?.range[1] &&
        sourceCode.getCommentsInside(container).length === 1
      return holdsOnlyThisComment ? container : null
    }

    function isAllowed(comment, exportedNames) {
      if (URL_RE.test(comment.value)) return true
      if (comment.type === 'Block' && comment.value.startsWith('*')) {
        if (isDocDirective(comment, context.filename)) return true
        const next = sourceCode.getTokenAfter(comment)
        const node = next && outermostNodeAt.get(next.range[0])
        return Boolean(node) && isOnExportedSymbol(node, exportedNames)
      }
      const value = comment.value.trim()
      if (comment.type === 'Line' && value.startsWith('/')) return true
      return DIRECTIVE.test(value)
    }

    return {
      '*'(node) {
        if (node.type !== 'Program' && !outermostNodeAt.has(node.range[0])) outermostNodeAt.set(node.range[0], node)
      },
      'Program:exit'(program) {
        const exportedNames = locallyExportedNames(program)
        for (const comment of sourceCode.getAllComments()) {
          if (isAllowed(comment, exportedNames)) continue
          context.report({
            loc: comment.loc,
            messageId: 'noComment',
            fix(fixer) {
              const text = sourceCode.getText()
              let [start, end] = emptyJsxContainer(comment)?.range ?? comment.range
              let lineStart = start
              while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--
              if (text.slice(lineStart, start).trim() === '') {
                start = lineStart
                if (text[end] === '\r') end++
                if (text[end] === '\n') end++
              } else {
                while (start > lineStart && (text[start - 1] === ' ' || text[start - 1] === '\t')) {
                  start--
                }
              }
              return fixer.removeRange([start, end])
            },
          })
        }
      },
    }
  },
}
