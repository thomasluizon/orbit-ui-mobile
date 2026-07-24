"use strict"

/**
 * Bans the double assertion escape hatch `x as unknown as T` / `x as any as T`.
 * Code Standards rule 3: use `unknown` with real narrowing. A double assertion
 * silently defeats the type system in exactly the way `as any` does, which is
 * why the old forbid-ts-antipatterns hook flagged it; this is the lint-tier
 * replacement that holds for every tool, not only Claude sessions.
 * https://github.com/thomasluizon/orbit-ui-mobile/blob/main/REBUILD.md
 */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Ban `as unknown as T` / `as any as T` double assertions",
    },
    schema: [],
    messages: {
      doubleAssertion:
        "Double assertion ({{form}}) defeats the type system. Narrow the type properly: validate with Zod at the boundary, or use a type guard.",
    },
  },
  create(context) {
    const isEscapeHatchType = (typeAnnotation) =>
      typeAnnotation &&
      (typeAnnotation.type === "TSUnknownKeyword" || typeAnnotation.type === "TSAnyKeyword")

    return {
      TSAsExpression(node) {
        const inner = node.expression
        if (inner.type !== "TSAsExpression") return
        if (!isEscapeHatchType(inner.typeAnnotation)) return
        context.report({
          node,
          messageId: "doubleAssertion",
          data: {
            form: inner.typeAnnotation.type === "TSUnknownKeyword" ? "as unknown as T" : "as any as T",
          },
        })
      },
    }
  },
}
