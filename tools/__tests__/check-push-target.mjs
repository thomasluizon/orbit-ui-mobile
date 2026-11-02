
import { check } from "./_harness.mjs"



export const cases = () => {
    check("check-push-target.mjs", "empty stdin is refused", [], { status: 2 }, { input: "" })
    check("check-push-target.mjs", "explicit no-refs allows empty stdin", ["--no-refs"], { status: 0 }, { input: "" })
    check("check-push-target.mjs", "a push to main is blocked", [], { status: 1, stderr: /BLOCKED/ }, { input: "refs/heads/main abc refs/heads/main def\n" })
    check("check-push-target.mjs", "a push to a feature branch is allowed", [], { status: 0 }, { input: "refs/heads/feature/x abc refs/heads/feature/x def\n" })
  }
