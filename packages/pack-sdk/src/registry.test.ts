import { describe, expect, it } from 'vitest'
import { DuplicatePackError, UnknownPackError, type PackManifest } from './manifest'
import { PackRegistry } from './registry'

const pack = (id: string, over: Partial<PackManifest> = {}): PackManifest => ({
  id,
  name: id,
  version: '1.0.0',
  description: '',
  permissions: [`${id}_spec:read`],
  documentTypes: [],
  itemCategories: [],
  navigation: [
    { group: 'Manufacturing', label: `${id} spec`, path: `/${id}/spec`, permission: `${id}_spec:read` },
  ],
  tables: [`${id}_spec`],
  ...over,
})

describe('PackRegistry', () => {
  it('registers and lists packs in a stable order', () => {
    const registry = new PackRegistry().register(pack('textile')).register(pack('carton'))
    expect(registry.all().map((p) => p.id)).toEqual(['carton', 'textile'])
  })

  it('refuses a duplicate id', () => {
    const registry = new PackRegistry().register(pack('carton'))
    expect(() => registry.register(pack('carton'))).toThrow(DuplicatePackError)
  })

  it('throws for an unknown pack rather than returning undefined', () => {
    expect(() => new PackRegistry().get('nope')).toThrow(UnknownPackError)
  })

  it('rejects an id that is not safe for SQL and permission strings', () => {
    const registry = new PackRegistry()
    for (const bad of ['Carton', 'carton-pack', "carton'; drop", '1carton', 'x']) {
      expect(() => registry.register(pack(bad))).toThrow(/lowercase/)
    }
  })

  it('refuses a pack that claims tables outside its own prefix', () => {
    // Otherwise one pack could gate — and hide — another pack's data.
    const registry = new PackRegistry()
    expect(() => registry.register(pack('carton', { tables: ['textile_fabric'] }))).toThrow(
      /own prefix/,
    )
  })

  it('collects permissions only from installed packs', () => {
    const registry = new PackRegistry().register(pack('carton')).register(pack('textile'))
    expect(registry.permissionsOf(['carton'])).toEqual(['carton_spec:read'])
  })

  it('ignores an installed id the build does not have', () => {
    // A tenant row can outlive a pack being removed from the product.
    const registry = new PackRegistry().register(pack('carton'))
    expect(registry.permissionsOf(['carton', 'gone'])).toEqual(['carton_spec:read'])
    expect(registry.navigationFor(['gone'], ['*'])).toEqual([])
  })

  describe('navigation', () => {
    const registry = new PackRegistry().register(pack('carton')).register(pack('textile'))

    it('shows nothing for a pack that is not installed', () => {
      expect(registry.navigationFor([], ['*'])).toEqual([])
    })

    it('requires the permission as well as the installation', () => {
      // Installed says the capability exists; the permission says who may use it.
      expect(registry.navigationFor(['carton'], [])).toEqual([])
      expect(registry.navigationFor(['carton'], ['carton_spec:read'])).toHaveLength(1)
    })

    it('honours a wildcard permission at segment boundaries only', () => {
      expect(registry.navigationFor(['carton'], ['carton_spec:*'])).toHaveLength(1)
      expect(registry.navigationFor(['carton'], ['carton:*'])).toEqual([])
    })

    it('merges entries from every installed pack', () => {
      expect(registry.navigationFor(['carton', 'textile'], ['*'])).toHaveLength(2)
    })
  })
})
