import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Android App Link associations', () => {
  it('publishes the production and staging packages with their app signing certificates', () => {
    const statements: unknown = JSON.parse(
      readFileSync(resolve(__dirname, '../public/.well-known/assetlinks.json'), 'utf8'),
    )

    expect(statements).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'org.useorbit.app',
          sha256_cert_fingerprints: [
            '4C:00:41:28:FC:34:AE:9A:5F:4E:F0:A5:AE:6F:25:E0:D7:F7:75:BB:B5:78:3C:62:13:44:7F:8F:42:70:F2:BB',
          ],
        },
      },
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'org.useorbit.app.staging',
          sha256_cert_fingerprints: [
            '62:AC:19:77:F5:55:4E:89:4B:09:C3:21:F6:E4:0B:C8:27:77:37:3F:0A:F8:FE:A1:F1:23:CE:67:D2:FD:59:AA',
          ],
        },
      },
    ])
  })
})
