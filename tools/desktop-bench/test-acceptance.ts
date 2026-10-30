import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { emailReply, acceptanceEmail, acceptanceCode } from './acceptance-mock'
import { verifyArtifact } from '../../apps/desktop/scripts/release'
import { corruptSignature } from './acceptance-contract.mjs'

const vector = JSON.parse(readFileSync(new URL('../../apps/desktop/__fixtures__/signer-vector.json', import.meta.url), 'utf8')) as { payload: string; signature: string; publicKey: string; version: string }
const bytes = Buffer.from(vector.payload)
verifyArtifact(bytes, vector.signature, vector.publicKey, vector.version)
assert.throws(() => verifyArtifact(bytes, corruptSignature(vector.signature), vector.publicKey, vector.version))
const sending = { email: acceptanceEmail, language: 'en' }
assert.deepEqual(emailReply('/api/auth/send-code', sending, 'fixture-token'), { status: 200, body: {} })
const login = emailReply('/api/auth/verify-code', { ...sending, code: acceptanceCode }, 'fixture-token')
assert.equal(login.status, 200)
assert.equal('token' in login.body && login.body.token, 'fixture-token')
for (const body of [{ ...sending, code: 'wrong' }, { email: 'foreign@example.invalid', language: 'en', code: acceptanceCode }]) {
  const rejected = emailReply('/api/auth/verify-code', body, 'fixture-token')
  assert.equal(rejected.status, 400)
  assert.equal('token' in rejected.body, false)
}
assert.throws(() => emailReply('/api/auth/verify-code', { email: acceptanceEmail }, 'fixture-token'))
