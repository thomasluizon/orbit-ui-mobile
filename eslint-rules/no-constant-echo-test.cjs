"use strict"

const MATCHERS = new Set(["toBe", "toEqual", "toStrictEqual"])
const SUPPORT_PATTERN = /__tests__\/|\.(test|spec)(\.|$)|test-support\/|factories/

const isSupportModule = (source) => SUPPORT_PATTERN.test(source)

const isPlainLiteral = (node) => {
  if (node.type === "Literal") {
    if (node.regex || node.bigint) return false
    return (
      node.value === null ||
      typeof node.value === "string" ||
      typeof node.value === "number" ||
      typeof node.value === "boolean"
    )
  }
  return node.type === "TemplateLiteral" && node.expressions.length === 0
}

const findVariable = (scope, name) => {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(name)
    if (variable) return variable
  }
  return null
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Ban a test that asserts an imported constant equal to a literal (CODING_STANDARDS.md LIE-1).",
    },
    schema: [],
    messages: {
      constantEcho:
        "This test asserts an imported constant equal to a literal, so it restates the code (CODING_STANDARDS.md LIE-1). Assert the behaviour that the constant drives.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode

    const isImportedFromCodeModule = (identifier) => {
      const variable = findVariable(sourceCode.getScope(identifier), identifier.name)
      if (!variable) return false
      return variable.defs.some(
        (definition) =>
          definition.type === "ImportBinding" &&
          typeof definition.parent?.source?.value === "string" &&
          !isSupportModule(definition.parent.source.value),
      )
    }

    const subjectRoot = (subject) => {
      if (subject.type === "Identifier") return subject
      if (subject.type === "MemberExpression" && subject.object.type === "Identifier") return subject.object
      return null
    }

    return {
      CallExpression(node) {
        const callee = node.callee
        if (callee.type !== "MemberExpression" || callee.computed) return
        if (callee.property.type !== "Identifier" || !MATCHERS.has(callee.property.name)) return

        const expectCall = callee.object
        if (expectCall.type !== "CallExpression") return
        if (expectCall.callee.type !== "Identifier" || expectCall.callee.name !== "expect") return
        if (expectCall.arguments.length !== 1) return

        if (node.arguments.length !== 1 || !isPlainLiteral(node.arguments[0])) return

        const root = subjectRoot(expectCall.arguments[0])
        if (!root || !isImportedFromCodeModule(root)) return

        context.report({ node, messageId: "constantEcho" })
      },
    }
  },
}
