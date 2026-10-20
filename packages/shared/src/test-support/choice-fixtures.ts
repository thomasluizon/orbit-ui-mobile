import { choiceBlockSchema, pickListBlockSchema } from '../types/chat'
import parts from './chat-parts.fixture.json'

export const choiceBlockFixture = choiceBlockSchema.parse(parts.blocks.find(part => part.kind === 'choice')?.block)
export const pickListBlockFixture = pickListBlockSchema.parse(parts.blocks.find(part => part.kind === 'pickList')?.block)
