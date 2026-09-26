"use strict"

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Keep the mobile Supabase module lazy: no module-scope throw or createClient()",
    },
    schema: [],
    messages: {
      moduleThrow:
        "Module-scope throw runs during the app's first import and crashes before any error boundary mounts. Move the check inside the lazy accessor.",
      eagerInit:
        "Top-level createClient() is eager init. Keep the client behind a lazy getSupabaseClient() accessor.",
    },
  },
  create(context) {
    const insideFunction = (node) => {
      for (let current = node.parent; current; current = current.parent) {
        if (
          current.type === "FunctionDeclaration" ||
          current.type === "FunctionExpression" ||
          current.type === "ArrowFunctionExpression"
        ) {
          return true
        }
      }
      return false
    }

    return {
      ThrowStatement(node) {
        if (!insideFunction(node)) context.report({ node, messageId: "moduleThrow" })
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "createClient") return
        if (!insideFunction(node)) context.report({ node, messageId: "eagerInit" })
      },
    }
  },
}
