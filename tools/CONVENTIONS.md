# Tool conventions

## The contract

Each tool in `tools/`:

- Has one purpose.
- Prints usage and exits 0 on `--help`.
- Exits 0 on success, 1 on a failed check and 2 on invalid input.
- Is non-interactive and never waits for input.
- Gives the same result from any working directory.
- Reads a large payload from stdin.
- Takes no secret in argv.

## Tests

A tool with decision paths has `tools/__tests__/<tool>.mjs`. The file exports `cases`. The test is hermetic: it uses no network, no worktree of the repository and no write outside a temporary root. It takes its helpers from `tools/__tests__/_harness.mjs`.

`node tools/test-tools.mjs` finds each test by its file name. A file whose name starts with `_` or ends with `.test.mjs` is not a case module.
