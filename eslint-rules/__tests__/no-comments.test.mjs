import { RuleTester } from 'eslint'
import parser from '@typescript-eslint/parser'
import { createRequire } from 'node:module'
import { afterAll, describe, it } from 'vitest'

const require = createRequire(import.meta.url)
RuleTester.describe = describe
RuleTester.it = it
RuleTester.afterAll = afterAll
const tester = new RuleTester({ languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } } })
const errors = [{ messageId: 'noComment' }]
const doc = '/** Explains the symbol. */'

const exportedForms = [
  'export const limit = 1',
  'export function read() {}',
  'export async function read() {}',
  'export default function read() {}',
  'export default class {}',
  'export default { limit: 1 }',
  'export class Reader {}',
  'export abstract class Reader {}',
  'export interface Reader {}',
  'export type Reader = string',
  'export enum Mode { On }',
  'export declare function read(): void',
  'export * from "./reader"',
  'export { read } from "./reader"',
  'const limit = 1\nexport { limit }',
  'const first = 1, limit = 2\nexport { limit }',
  'const { limit } = settings\nexport { limit }',
  'function read() {}\nexport { read as load }',
  'function read() {}\nexport default read',
  'class Reader {}\nexport default Reader',
  'interface Reader {}\nexport type { Reader }',
  'type Reader = string\nexport type { Reader }',
  'enum Mode { On }\nexport { Mode }',
  'function read(): void\nfunction read() {}\nexport { read }',
  'module.exports = { limit: 1 }',
  'module.exports.limit = 1',
  'exports.limit = 1',
]

const exportedMembers = [
  `export class Reader {\n  ${doc}\n  limit = 1\n}`,
  `export class Reader {\n  ${doc}\n  private static async read() {}\n}`,
  `export abstract class Reader {\n  ${doc}\n  abstract read(): void\n}`,
  `export default class {\n  ${doc}\n  read() {}\n}`,
  `export interface Reader {\n  ${doc}\n  limit: number\n}`,
  `export interface Reader {\n  ${doc}\n  read(): void\n}`,
  `export interface Reader {\n  ${doc}\n  [key: string]: number\n}`,
  `export type Reader = {\n  ${doc}\n  limit: number\n}`,
  `export type Reader = {\n  nested: {\n    ${doc}\n    limit: number\n  }\n}`,
  `export enum Mode {\n  ${doc}\n  On,\n}`,
  `export const reader = {\n  ${doc}\n  limit: 1,\n}`,
  `export const reader = {\n  ${doc}\n  read() {},\n}`,
  `export default {\n  ${doc}\n  limit: 1,\n}`,
  `export const schema = object({\n  ${doc}\n  limit: number(),\n})`,
  `export default defineConfig({\n  test: {\n    ${doc}\n    isolate: true,\n  },\n})`,
  `export function read(options: {\n  ${doc}\n  limit: number\n}) {}`,
  `interface Reader {\n  ${doc}\n  limit: number\n}\nexport type { Reader }`,
  `class Reader {\n  ${doc}\n  read() {}\n}\nexport default Reader`,
  `const reader = {\n  ${doc}\n  limit: 1,\n}\nexport { reader }`,
  `module.exports = {\n  ${doc}\n  limit: 1,\n}`,
]

const directives = [
  '/* eslint-disable no-console */',
  '/* eslint-enable no-console */',
  '// eslint-disable-line no-console',
  '// eslint-disable-next-line no-console',
  '// eslint-env node',
  '/* global window */',
  '/* globals window, document */',
  '/* exported read */',
  '// @ts-expect-error the fixture passes a wrong type',
  '// ts-prune-ignore-next',
  '// prettier-ignore',
  '/* @jsx h */',
  '/* c8 ignore next */',
  '/* v8 ignore next */',
  '/* istanbul ignore next */',
  '/* webpackChunkName: "reader" */',
  '/* @vite-ignore */',
  '// @vitest-environment jsdom',
  '/* @__PURE__ */',
  '/* #__PURE__ */',
  '/* @license MIT */',
  '/* @preserve */',
  '/// <reference types="node" />',
  '/** @ts-expect-error the fixture passes a wrong type */',
  '/** @jsx h */',
  '/** @jsxImportSource preact */',
  '/** @vitest-environment jsdom */',
  '/** @license MIT */',
  '/** @preserve */',
  '/**\n * Reader 1.0\n * @license MIT\n */',
]

const typeAnnotations = [
  '/** @type {import("./reader").Options} */\nconst options = {}',
  '/** @typedef {{ limit: number }} Options */\nconst options = {}',
  '/** @satisfies {Options} */\nconst options = {}',
  '/** @template T */\nfunction read(value) { return value }',
  '/** @import { Options } from "./reader" */\nconst options = {}',
  '/**\n * Reads one value.\n * @param {string} name\n */\nfunction read(name) { return name }',
  '/**\n * Reads one value.\n * @returns {string}\n */\nfunction read() { return "" }',
  'function read(value) {\n  return /** @type {string} */ (value)\n}',
]

const rejected = [
  ['a function', 'function read() {}'],
  ['a constant', 'const limit = 1'],
  ['a class', 'class Reader {}'],
  ['a type', 'type Reader = string'],
  ['an interface', 'interface Reader {}'],
  ['an enum', 'enum Mode { On }'],
  ['a statement', 'read()'],
  ['an import', 'import { read } from "./reader"\nexport { read }'],
]

tester.run('no-comments', require('../no-comments.cjs'), {
  valid: [
    ...exportedForms.map(code => `${doc}\n${code}`),
    ...exportedMembers,
    `/** Mirrors https://example.com/reader. */\nfunction read() {}`,
    `function read() {\n  /** See https://example.com/reader. */\n  return 1\n}`,
    '// WHY: https://example.com/reader keeps the first value.\nconst limit = 1',
    ...directives.map(directive => `${directive}\nconst limit = 1`),
    ...['reader.js', 'reader.jsx', 'reader.mjs', 'reader.cjs'].flatMap(filename => typeAnnotations.map(code => ({ code, filename }))),
  ],
  invalid: [
    ...rejected.map(([name, code]) => ({ name: `a doc comment on ${name} that is not exported`, code: `${doc}\n${code}\n`, output: `${code}\n`, errors })),
    {
      name: 'a doc comment inside the body of an exported function',
      code: `export function read() {\n  ${doc}\n  const limit = 1\n  return limit\n}\n`,
      output: 'export function read() {\n  const limit = 1\n  return limit\n}\n',
      errors,
    },
    {
      name: 'a doc comment on a member of a class that is not exported',
      code: `class Reader {\n  ${doc}\n  read() {}\n}\n`,
      output: 'class Reader {\n  read() {}\n}\n',
      errors,
    },
    {
      name: 'a doc comment on a member of an interface that is not exported',
      code: `interface Reader {\n  ${doc}\n  limit: number\n}\n`,
      output: 'interface Reader {\n  limit: number\n}\n',
      errors,
    },
    {
      name: 'a doc comment on a member of an object literal that is not exported',
      code: `const reader = {\n  ${doc}\n  limit: 1,\n}\n`,
      output: 'const reader = {\n  limit: 1,\n}\n',
      errors,
    },
    {
      name: 'a doc comment on a member of an object literal that an exported function returns',
      code: `export const useReader = create(() => ({\n  ${doc}\n  read() {},\n}))\n`,
      output: 'export const useReader = create(() => ({\n  read() {},\n}))\n',
      errors,
    },
    {
      name: 'a doc comment on a member of a class inside the body of an exported function',
      code: `export function read() {\n  class Reader {\n    ${doc}\n    limit = 1\n  }\n  return Reader\n}\n`,
      output: 'export function read() {\n  class Reader {\n    limit = 1\n  }\n  return Reader\n}\n',
      errors,
    },
    {
      name: 'a doc comment in a static block of an exported class',
      code: `export class Reader {\n  static {\n    ${doc}\n    start()\n  }\n}\n`,
      output: 'export class Reader {\n  static {\n    start()\n  }\n}\n',
      errors,
    },
    {
      name: 'a doc comment on a local constant that has the name of an export',
      code: `const limit = 1\nexport { limit }\nfunction read() {\n  ${doc}\n  const limit = 2\n  return limit\n}\n`,
      output: 'const limit = 1\nexport { limit }\nfunction read() {\n  const limit = 2\n  return limit\n}\n',
      errors,
    },
    {
      name: 'a doc comment on a value inside an exported declaration',
      code: `export const limits = [\n  ${doc}\n  1,\n]\n`,
      output: 'export const limits = [\n  1,\n]\n',
      errors,
    },
    {
      name: 'a doc comment after the last statement',
      code: `export const limit = 1\n${doc}\n`,
      output: 'export const limit = 1\n',
      errors,
    },
    {
      name: 'a doc comment in a JSX expression container',
      code: `export const Reader = () => (\n  <div>\n    {${doc}}\n    <span />\n  </div>\n)\n`,
      output: 'export const Reader = () => (\n  <div>\n    <span />\n  </div>\n)\n',
      errors,
    },
    {
      name: 'a doc comment in a JSX expression container between two elements',
      code: `export const Reader = () => <div><span />{ ${doc} }<span /></div>\n`,
      output: 'export const Reader = () => <div><span /><span /></div>\n',
      errors,
    },
    {
      name: 'a block comment in a JSX expression container that also holds an allowed comment',
      code: 'export const Reader = () => <div>{/* Reads one value. */ /* https://example.com/reader */}</div>\n',
      output: 'export const Reader = () => <div>{ /* https://example.com/reader */}</div>\n',
      errors,
    },
    {
      name: 'a doc comment in an empty object literal',
      code: `export const reader = { ${doc} }\n`,
      output: 'export const reader = { }\n',
      errors,
    },
    {
      name: 'a doc comment after code on the same line',
      code: `const limit = 1 ${doc}\n`,
      output: 'const limit = 1\n',
      errors,
    },
    {
      name: 'a type annotation tag in a TypeScript file',
      code: '/** @type {number} */\nconst limit = 1\n',
      output: 'const limit = 1\n',
      filename: 'reader.ts',
      errors,
    },
    {
      name: 'a parameter tag without a type in a JavaScript file',
      code: '/**\n * Reads one value.\n * @param name the value to read\n */\nfunction read(name) { return name }\n',
      output: 'function read(name) { return name }\n',
      filename: 'reader.js',
      errors,
    },
    {
      name: 'a pragma word that does not start a line',
      code: '/** Reads the @license text. */\nfunction read() {}\n',
      output: 'function read() {}\n',
      errors,
    },
    { name: 'a line comment', code: '// Reads one value.\nconst limit = 1\n', output: 'const limit = 1\n', errors },
    { name: 'a block comment', code: '/* Reads one value. */\nexport const limit = 1\n', output: 'export const limit = 1\n', errors },
  ],
})
