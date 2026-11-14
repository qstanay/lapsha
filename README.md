# Lapsha

Simple REST API framework for Node.js and TypeScript.

Versions are git tags of the form `1.2.3`. A release is the tag.

## Package

`lapsha` is this repository, published from the root `package.json`. `0.0.x` holds the npm name. The HTTP API is not in the package yet.

Requires Node.js 22 or newer.

```ts
import { version } from "lapsha";
```

```
src/index.ts    source of the public entry
dist/           JavaScript and type declarations published to npm
test/           not published
```

`pnpm test` typechecks `src/` and writes `dist/`. It needs `DATABASE_URL` pointing at a Postgres server. The `exports` map points at `dist/index.js` and `dist/index.d.ts`. The published tarball contains `dist/`, this readme, and the license.

## Release

A release is a git tag `X.Y.Z`. The tag, `package.json` `version`, and the `version` export are the same number.

Pushing that tag runs `.github/workflows/release.yml`. The workflow publishes only when the tag matches `package.json`.
