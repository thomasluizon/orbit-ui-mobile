# Coding standards

The reviewer reads this file: Pullfrog and the local review. Workers do not load it. The reviewer reads it from the base branch with `git show origin/main:CODING_STANDARDS.md`, so a pull request never changes the rules that judge it.

## Contents

- How review uses this file
- Code
- Tests
- Tests that lie
- Smells

## How review uses this file

1. Review has two axes, and each runs apart from the other. Standards asks "is it built right?" and reads this file. Spec asks "is it the right thing?" and reads the linked ticket. Report the two axes apart. Never merge or rerank them.
2. Every finding cites one rule id of this file, one smell name with the hunk, or one line of the ticket. A finding with no citation is not a finding.
3. Skip what a lint rule, the type check or a test already enforces.
4. A rule of this file wins over a smell. A smell is always a judgement call.
5. Act on the findings that have a citation, then stop. Never review again and again until a review comes back clean.
6. A mechanical rule gets a deterministic check: a lint rule, a type, a test or a hook. A rule here names its check when it has one. A rule that fires on good code is deleted.

## Code

- CODE-1 Fix the root cause. Add no defensive branch for a problem that an upstream owner has. An unavoidable one gets a one-line WHY comment.
- CODE-2 Put cross-app code in `packages/shared` and cross-component code in `apps/<platform>/components/`. Extract on the third real use.
- CODE-3 Web: Wrap shadcn-style primitives in `components/ui/*` and restyle them to the tokens. Never use one in its default state.
- CODE-4 Desktop: Keep the Rust entry point minimal. Do not add native commands or plugins without their carrying ticket and origin-scoped capabilities.

## Tests

- TEST-1 **Behavior, not implementation.** Assert what the user or caller observes: rendered text, a `data-*` attribute, a returned value, a thrown error. Never assert class names, call order, or private state. Those pass while the behavior is broken and block honest refactors.
- TEST-2 **Three axes.** A real test covers the happy path **and** an edge case **and** a failure case. Invalid input must be *rejected*, not just valid input accepted.
- TEST-3 **Factories over literals.** Build fixtures with `packages/shared/src/__tests__/factories.ts` so a schema change updates every test in one place.
- TEST-4 **Fixtures follow producers.** Confirm payload shapes against the real producer or recorded external response. Never write the fixture that agrees with a guess (`CLAUDE.md`, Code).
- TEST-5 **Exercise the path that broke.** Advance timers through automatic replays, enter the affected mode, prove accepted destinations as well as rejection, and mount the owning composition when ownership is the behavior. A child-only test cannot prove that its parent avoids duplicate subscriptions.
- TEST-6 **Parity.** A behavior that lands on both platforms gets a test on both platforms in the same change (the cross-platform parity rule).
- TEST-7 **Property tests** for pure shared logic (`@fast-check/vitest`) when a value range matters more than a single example.
- TEST-8 **What to avoid.** Happy-path-only; rubber-stamp / assertion-free; "asserts a mock was called" tautologies; over-mocked tests that exercise the mock instead of the code; implementation-coupled tests (call-order or private state); snapshot-as-crutch.

## Tests that lie

A green check does not prove that the code is right. These tests pass while the code is wrong, so they do not count as the test that fails without a fix.

- LIE-1 Tautological test. The expected value restates the code: a constant asserted equal to the value it holds, or an expected value computed the way the code computes it. Example: `expect(X_POST_CHARACTER_LIMIT).toBe(280)`. Take the expected value from an independent source: the ticket, a worked example, a recorded response. Check: `local/no-constant-echo-test`.
- LIE-2 Structure-sensitive test. The test reads a source file as text, or parses it, and checks its layout, order or names. It breaks on a safe refactor and passes when the behaviour is wrong. Render the component, call the function, or read the built output. A repository-wide guard test (a ban that scans every file) lives in `__tests__/guards/`. Check: `local/no-source-text-test`.
- LIE-3 A test that cannot fail. A mock or a stub replaces the code under test or hides its real failure modes. Example: `vi.stubGlobal("AudioContext", ...)` that never throws. Mock only at a system boundary: the network, the clock, randomness, storage, the device, and platform modules such as `next/navigation` and Expo native modules. Never mock a module of this repository (a hook, a component, a Server Action, a `lib/` function) in a test that a pull request adds or changes. When a module is hard to test without that mock, change its interface.
- LIE-4 A test that passes on the code before the fix does not prove the fix. Run it red before the fix.

## Smells

Each smell is a judgement call. Name it and quote the hunk. A rule above wins over it.

- Mysterious Name: a name that does not say what the thing does or holds. Rename it.
- Duplicated Code: the same logic shape in more than one hunk or file of the change. Extract it once.
- Feature Envy: a function that reads another module's data more than its own. Move it to that data.
- Data Clumps: the same few fields or parameters travel together. Make them one type.
- Primitive Obsession: a string or number stands for a domain idea. Give the idea its own small type.
- Repeated Switches: the same switch or if chain on the same value in more than one place. Use one map or one function.
- Shotgun Surgery: one logical change edits many files. Put what changes together in one module.
- Divergent Change: one module changes for several unrelated reasons. Split it.
- Speculative Generality: a parameter, hook or abstraction that the ticket does not need. Delete it.
- Message Chains: a long `a.b().c().d()` walk. Hide the walk behind one function.
- Middle Man: a function or module that only passes calls on. Call the target directly.
- Refused Bequest: an implementer that ignores most of what it inherits. Use composition.

The list is the smell baseline of Matt Pocock's `/code-review` skill (MIT), after Martin Fowler, Refactoring, chapter 3. The repository rules above win over it.
