# Producer fixtures

The catalog and complete documents come from `thomasluizon/orbit-api` commit
`84b8829f24fc258a744a3cc9d26f52407eb53f99`. Document JSON is compacted without
changing any values. They are external interface evidence, never runtime inputs.

Re-derive each file with `git show` against that commit:

```sh
git show 84b8829f24fc258a744a3cc9d26f52407eb53f99:src/Orbit.Api/OpenApi/artifacts.json
git show 84b8829f24fc258a744a3cc9d26f52407eb53f99:src/Orbit.Api/openapi.json
git show 84b8829f24fc258a744a3cc9d26f52407eb53f99:src/Orbit.Api/openapi_v1-r2.json
git show 84b8829f24fc258a744a3cc9d26f52407eb53f99:src/Orbit.Api/openapi_v2-r2.json
```
