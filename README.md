# @dreplyai/nuxt-admin-module

Reusable Nuxt admin overlays for DreplyAI services. Consumed as
a Nuxt layer by host admin frontends (flowdsl/admin,
redelay/admin, …) extending `js-admin-nuxt4`.

## What ships here

- **`modules/assistant/`** — admin UI for the
  [`@dreplyai/go-assistant`](https://github.com/DreplyAI/go-assistant)
  kernel. Pages: `/assistant/chats`, `/assistant/handoffs`,
  `/assistant/templates`. Backed by the kernel's admin HTTP
  routes (see `go-assistant/admin`).

Future DreplyAI admin overlays (e.g. ledger admin, search admin
beyond what go-modules ships) land here too. Each is a self-
contained folder under `modules/`.

## How host projects consume it

Add as a layer in `nuxt.config.ts` and as a dependency in
`package.json`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  extends: [
    '@dreplyai/nuxt-admin-module',                          // this
    resolve(__dirname, '../../redelay/js-admin-nuxt4'),    // base
  ],
  // ...
})
```

```json
// package.json — local dev path
{
  "dependencies": {
    "@dreplyai/nuxt-admin-module": "file:../../dreplyai-nuxt-admin-module"
  }
}
```

Once we tag a release, swap the `file:` to:

```json
"@dreplyai/nuxt-admin-module": "github:DreplyAI/nuxt-admin-module#v0.1.0"
```

The `js-admin-nuxt4` base layer's `modules/discovery.ts` walks
every Nuxt layer's `modules/` directory automatically — no
manual registration needed.

## Repo layout

```
dreplyai-nuxt-admin-module/
├── nuxt.config.ts          marker layer config
├── package.json            name: @dreplyai/nuxt-admin-module
└── modules/
    └── assistant/
        ├── module.ts
        ├── types/
        ├── composables/
        └── pages/
```

## Companion repo

- [`DreplyAI/go-assistant`](https://github.com/DreplyAI/go-assistant)
  — the Go assistant kernel this admin overlay drives.
