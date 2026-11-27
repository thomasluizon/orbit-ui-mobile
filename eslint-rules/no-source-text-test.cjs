"use strict"

const READ_FUNCTIONS = new Set(["readFileSync", "readFile"])
const FS_MODULES = new Set(["fs", "node:fs", "fs/promises", "node:fs/promises"])
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"]
const GUARDS_SEGMENT = "/__tests__/guards/"

const endsWithSourceExtension = (text) => SOURCE_EXTENSIONS.some((extension) => text.endsWith(extension))

const findVariable = (scope, name) => {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(name)
    if (variable) return variable
  }
  return null
}

const containsSourcePath = (node) => {
  if (!node || typeof node.type !== "string") return false
  if (node.type === "Literal") return typeof node.value === "string" && endsWithSourceExtension(node.value)
  if (node.type === "TemplateElement") return endsWithSourceExtension(node.value.cooked ?? node.value.raw)
  return Object.keys(node).some((key) => {
    if (key === "parent") return false
    const child = node[key]
    if (Array.isArray(child)) return child.some(containsSourcePath)
    return child && typeof child === "object" && containsSourcePath(child)
  })
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Ban a test that reads a source file as text (CODING_STANDARDS.md LIE-2).",
    },
    schema: [],
    messages: {
      sourceText:
        "This test reads a source file as text, so it checks structure, not behaviour (CODING_STANDARDS.md LIE-2). Render it, call it, or read the built output. A repository-wide guard lives in __tests__/guards/.",
    },
  },
  create(context) {
    const filename = (context.filename ?? "").replaceAll("\\", "/")
    if (filename.includes(GUARDS_SEGMENT) || filename.startsWith(GUARDS_SEGMENT.slice(1))) return {}

    const sourceCode = context.sourceCode

    const importDefinition = (identifier) => {
      const variable = findVariable(sourceCode.getScope(identifier), identifier.name)
      const definition = variable?.defs.find((candidate) => candidate.type === "ImportBinding")
      const source = definition?.parent?.source?.value
      if (typeof source !== "string" || !FS_MODULES.has(source)) return null
      const specifier = definition.node
      const imported = specifier.type === "ImportSpecifier" ? (specifier.imported.name ?? specifier.imported.value) : null
      return { imported }
    }

    const isFsModuleObject = (node) => {
      if (node.type === "Identifier") {
        const definition = importDefinition(node)
        return Boolean(definition) && (definition.imported === null || definition.imported === "promises")
      }
      if (node.type === "MemberExpression" && !node.computed && node.property.name === "promises") {
        return node.object.type === "Identifier" && isFsModuleObject(node.object)
      }
      return false
    }

    const isFsRead = (callee) => {
      if (callee.type === "Identifier") {
        const definition = importDefinition(callee)
        return Boolean(definition) && READ_FUNCTIONS.has(definition.imported)
      }
      if (callee.type === "MemberExpression" && !callee.computed) {
        return READ_FUNCTIONS.has(callee.property.name) && isFsModuleObject(callee.object)
      }
      return false
    }

    return {
      CallExpression(node) {
        if (!isFsRead(node.callee)) return
        const firstArgument = node.arguments[0]
        if (!firstArgument || !containsSourcePath(firstArgument)) return
        context.report({ node, messageId: "sourceText" })
      },
    }
  },
}
