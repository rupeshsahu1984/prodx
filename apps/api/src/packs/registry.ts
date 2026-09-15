import { cartonPack } from '@prodx/pack-carton'
import { PackRegistry } from '@prodx/pack-sdk'
import { textilePack } from '@prodx/pack-textile'

/**
 * The packs present in this build.
 *
 * This file is the ONLY place core knows a pack exists, and it knows nothing
 * about them beyond their manifests. Adding a pack is one import and one
 * register call; nothing else in core changes (ADR 0009).
 */
export const packRegistry = new PackRegistry().register(cartonPack).register(textilePack)
