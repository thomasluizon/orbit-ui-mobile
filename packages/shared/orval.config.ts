import { defineConfig } from 'orval'
import { loadContractOptions } from './scripts/contract-source.mjs'

export default defineConfig({
  orbit: loadContractOptions,
})
