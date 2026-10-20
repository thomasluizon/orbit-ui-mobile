"use strict"

module.exports = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      rejectingWait: "Use settleAnimations for animation completion. Promise.all rejects when a transition is cancelled.",
    },
  },
  create(context) {
    if (!context.filename.split(/[\\/]/).includes("e2e")) return {}
    const source = context.sourceCode
    const propertyName = (node) => node.computed
      ? (node.property.type === "Literal" ? node.property.value : undefined)
      : node.property.name

    function containsFinished(node, visited = new Set()) {
      if (!node || visited.has(node)) return false
      visited.add(node)
      if (node.type === "MemberExpression" && propertyName(node) === "finished") return true
      if (node.type === "Identifier") {
        for (let scope = source.getScope(node); scope; scope = scope.upper) {
          const variable = scope.set.get(node.name)
          if (!variable) continue
          return variable.defs.some((definition) =>
            definition.node.type === "VariableDeclarator" && containsFinished(definition.node.init, visited))
        }
      }
      return (source.visitorKeys[node.type] || []).some((key) => {
        const children = Array.isArray(node[key]) ? node[key] : [node[key]]
        return children.some((child) => containsFinished(child, visited))
      })
    }

    return {
      CallExpression(node) {
        const callee = node.callee
        if (callee.type !== "MemberExpression" || callee.object.type !== "Identifier"
          || callee.object.name !== "Promise" || propertyName(callee) !== "all") return
        if (node.arguments.some((argument) => containsFinished(argument))) {
          context.report({ node, messageId: "rejectingWait" })
        }
      },
    }
  },
}
