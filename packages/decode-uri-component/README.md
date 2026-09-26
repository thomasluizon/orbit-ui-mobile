# CommonJS decoder for Expo Router

This package ports `decode-uri-component` 0.5.0 to CommonJS for `query-string` 7.1.3.
The code in `index.js` comes from Sam Verschueren's
[`v0.5.0`](https://github.com/SamVerschueren/decode-uri-component/tree/v0.5.0)
release. The only code change is replacing the ESM default export with a CommonJS
callable export. The upstream MIT license is included in `LICENSE`.

Expo Router 57 and 58 still load `query-string` 7, which uses
`require('decode-uri-component')`. Keep the root dependency and override until
Expo Router adopts a compatible patched decoder.
