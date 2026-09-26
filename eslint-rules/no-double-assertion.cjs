"use strict"

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
