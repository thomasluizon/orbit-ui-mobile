import ts from 'typescript'

const stringConstructors = new Set([
  'zod.string', 'zod.stringFormat', 'zod.email', 'zod.url', 'zod.hostname', 'zod.uuid',
  'zod.iso.date', 'zod.iso.time', 'zod.iso.datetime',
])

function isStringSchema(expression, source) {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) return false
  if (stringConstructors.has(expression.expression.getText(source))) return true
  if (expression.expression.name.text === 'array') return false
  return isStringSchema(expression.expression.expression, source)
}

export function preserveUtf16Bounds(content) {
  const source = ts.createSourceFile('api.generated.ts', content, ts.ScriptTarget.Latest, true)
  const edits = []
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ['min', 'max', 'length'].includes(node.expression.name.text) &&
        isStringSchema(node.expression.expression, source)) {
      const bound = node.expression.name.text
      const argumentsText = node.arguments.map((argument) => argument.getText(source)).join(', ')
      edits.push({
        start: node.expression.name.getStart(source), end: node.getEnd(),
        replacement: `check(utf16Length('${bound}', ${argumentsText}))`,
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  for (const { start, end, replacement } of edits.sort((left, right) => right.start - left.start)) {
    content = content.slice(0, start) + replacement + content.slice(end)
  }
  if (edits.length === 0) return content
  return content.replace(/(import[^\n]+from ['"]zod['"];?)/,
    "$1\nimport { utf16Length } from '../../validation/utf16-length';")
}
