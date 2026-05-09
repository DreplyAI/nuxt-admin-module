/**
 * Self-registration plugin for the @dreplyai/nuxt-admin-module
 * layer. Each `modules/<name>/module.ts` exports a
 * `defineRedelayModule({...})` config; we glob them at build time
 * and push them into the same Pinia "modules" store the base
 * layer's plugin uses, so the host's sidebar picks up our nav
 * entries.
 *
 * Why this isn't done by the base layer's discovery: Vite's
 * `import.meta.glob` patterns must be statically analysable
 * relative or absolute paths — bare package names like
 * `@dreplyai/nuxt-admin-module/modules/*` aren't allowed.
 * Putting the glob HERE (relative to this plugin file) sidesteps
 * the limitation cleanly.
 *
 * Two non-obvious details:
 *
 *  1. We DO NOT call `useModulesStore()` (the auto-imported
 *     hook). Nuxt's auto-import injection skips files inside
 *     node_modules and inside symlinked link: deps — and our
 *     layer ships into the consumer via either pnpm-packed
 *     node_modules or via a `link:` symlink, so we cannot rely
 *     on the auto-import. Instead we go through Pinia's
 *     documented runtime API: getActivePinia()._s.get('modules')
 *     returns the same store handle by id.
 *
 *  2. We use `enforce: 'post'` so this plugin runs AFTER the
 *     base layer's `modules-registration.ts` plugin. The base
 *     plugin calls `useModulesStore()` which CREATES the store
 *     on first use; if we ran first, the store wouldn't exist
 *     yet and `_s.get('modules')` would return undefined.
 */
import { getActivePinia } from 'pinia'

interface SharedLayerModule {
  id: string
  enabled?: boolean
  onInit?: () => void | Promise<void>
  _modulePath?: string
}

// Top-of-file marker — fires the moment Vite imports this file.
// If we don't see this in container logs after a request, Nuxt
// never even loaded the plugin (= layer plugin auto-discovery
// problem).
console.log('[@dreplyai/nuxt-admin-module] plugin file imported')

export default defineNuxtPlugin({
  // Run after the base layer's `modules-registration.ts` plugin
  // (which is unenforced/default) so the 'modules' Pinia store
  // already exists when we look it up.
  enforce: 'post',
  async setup() {
    console.log('[@dreplyai/nuxt-admin-module] setup() running')
    const pinia = getActivePinia() as any
    const storeIds = pinia?._s ? [...pinia._s.keys()] : null
    console.log('[@dreplyai/nuxt-admin-module] pinia present:', !!pinia, '— store ids:', storeIds)
    // Pinia's `_s` is its internal Map<id, StoreInstance>. The base
    // layer's plugin populates it by calling useModulesStore()
    // first. Defensive: bail quietly if it isn't there yet.
    const modulesStore = pinia?._s?.get?.('modules')
    if (!modulesStore || typeof modulesStore.registerModules !== 'function') {
      console.warn('[dreplyai-nuxt-admin-module] modules store not initialised; skipping registration. store=', !!modulesStore, 'has registerModules=', typeof modulesStore?.registerModules)
      return
    }

    // Glob is relative to THIS plugin file —
    // dreplyai-nuxt-admin-module/modules/<name>/module.ts. Adds
    // new shared overlays automatically as long as they follow
    // the redelay module convention.
    const sharedModules = import.meta.glob<{ default: SharedLayerModule }>(
      '../modules/*/module.ts',
      { eager: true },
    )

    const toRegister: SharedLayerModule[] = []
    for (const [path, mod] of Object.entries(sharedModules)) {
      if (!mod || !mod.default) continue
      const def = mod.default
      def._modulePath = path
      toRegister.push(def)
    }
    console.log('[@dreplyai/nuxt-admin-module] glob found', Object.keys(sharedModules).length, 'paths; toRegister ids:', toRegister.map(m => m.id))

    // The store dedupes by `id`, so re-registering is harmless.
    modulesStore.registerModules(toRegister)
    console.log('[@dreplyai/nuxt-admin-module] after registerModules; total store size:', modulesStore.modules?.length ?? modulesStore.allModules?.length ?? 'unknown', 'state keys:', Object.keys(modulesStore.$state || {}))

    // onInit hooks (mirrors the base layer's loop).
    for (const mod of toRegister) {
      if (mod.onInit && mod.enabled !== false) {
        try {
          await mod.onInit()
        } catch (e) {
          console.error(`Error initializing module ${mod.id}:`, e)
        }
      }
    }
  },
})
