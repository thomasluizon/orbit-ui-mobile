"use strict"

const DIRECTIVE = /^\s*eslint-disable(?:-next-line|-line)?\b/

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Require a ` -- reason` on every eslint-disable directive",
    },
    schema: [],
    messages: {
      missingReason:
        "eslint-disable without a justification. Append ` -- <why this is unavoidable>`, or fix the underlying issue.",
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (!DIRECTIVE.test(comment.value)) continue
          if (/\s--\s+\S/.test(comment.value)) continue
          context.report({ loc: comment.loc, messageId: "missingReason" })
        }
      },
    }
  },
}
