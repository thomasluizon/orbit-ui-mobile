import { createServer } from 'node:http'
import { handleRequest, validateFixturesOrExit } from './request-handler'

validateFixturesOrExit()

createServer(handleRequest).listen(5099, '127.0.0.1', () => {
  process.stdout.write('[mock] mock orbit-api listening on http://127.0.0.1:5099\n')
})
