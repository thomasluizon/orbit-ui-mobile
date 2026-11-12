import { escapeRegex } from "../lib/escape-regex.mjs"
import { T } from "./_harness.mjs"

const UNIT = "lib/escape-regex.mjs"
const SYNTAX = ".*+?^${}()|[]\\"

export const cases = () => {
  T(`${UNIT}: every pattern syntax character matches itself`, new RegExp(`^${escapeRegex(SYNTAX)}$`).test(SYNTAX), escapeRegex(SYNTAX))
  T(`${UNIT}: an escaped dot does not match another character`, !new RegExp(`^${escapeRegex("a.b")}$`).test("axb"))
  T(`${UNIT}: an escaped value keeps its plain characters`, escapeRegex("apps/web-1_2#3") === "apps/web-1_2#3")
}
