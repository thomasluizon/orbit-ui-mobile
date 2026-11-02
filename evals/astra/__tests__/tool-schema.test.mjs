import { expect, it } from 'vitest'
import { nullableSchema, resolveSchema, schemaVariants } from '../tool-schema.mjs'

it('resolves aliases at the supplied parameters root and decodes local pointer segments', () => {
  const habit = { type: 'object', properties: { title: { type: 'string' } } }
  const root = { $defs: { habit, alias: { $ref: '#/$defs/habit' }, 'a/b~c d': { type: 'integer' } } }
  expect(resolveSchema({ $ref: '#' }, root)).toBe(root)
  expect(resolveSchema({ $ref: '#/$defs/alias' }, root)).toBe(habit)
  expect(resolveSchema({ $ref: '#/$defs/a~1b~0c%20d' }, root)).toBe(root.$defs['a/b~c d'])
  const other = { $defs: { habit: { type: 'boolean' } } }
  expect(resolveSchema({ $ref: '#/$defs/habit' }, other)).toBe(other.$defs.habit)
})

it.each([
  ['external', { $ref: 'https://example.invalid/schema' }, {}, 'Only local'],
  ['missing', { $ref: '#/$defs/missing' }, { $defs: {} }, 'Missing local'],
  ['self alias', { $ref: '#' }, { $ref: '#' }, 'Cyclic schema alias'],
  ['mutual aliases', { $ref: '#/$defs/first' }, { $defs: {
    first: { $ref: '#/$defs/second' }, second: { $ref: '#/$defs/first' },
  } }, 'Cyclic schema alias'],
])('rejects %s references', (_, schema, root, message) => {
  expect(() => resolveSchema(schema, root)).toThrow(message)
})

it('follows nullable reference unions without expanding a recursive habit definition', () => {
  const root = { $defs: { habit: { type: 'object', properties: {
    sub_habits: { type: ['array', 'null'], items: { $ref: '#/$defs/habit' } },
  } }, optional: { anyOf: [{ $ref: '#/$defs/habit' }, { type: 'null' }] } } }
  const reference = { $ref: '#/$defs/optional' }
  expect(schemaVariants(reference, root)).toEqual([root.$defs.habit, { type: 'null' }])
  expect(nullableSchema(reference, root)).toBe(true)
  expect(nullableSchema(root.$defs.habit.properties.sub_habits, root)).toBe(true)
  expect(nullableSchema({ $ref: '#/$defs/habit' }, root)).toBe(false)
  expect(resolveSchema(root.$defs.habit.properties.sub_habits.items, root)).toBe(root.$defs.habit)
  expect(schemaVariants(undefined, root)).toEqual([])
})

it('rejects a union alias cycle while allowing the same definition in independent alternatives', () => {
  const root = { $defs: { loop: { anyOf: [{ $ref: '#/$defs/loop' }, { type: 'null' }] },
    title: { type: 'string' } } }
  expect(() => schemaVariants({ $ref: '#/$defs/loop' }, root)).toThrow('Cyclic schema union')
  expect(schemaVariants({ anyOf: [{ $ref: '#/$defs/title' }, { $ref: '#/$defs/title' }] }, root))
    .toEqual([root.$defs.title, root.$defs.title])
})
