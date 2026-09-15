import {
  assertValidManifest,
  DuplicatePackError,
  UnknownPackError,
  type PackManifest,
  type PackNavigationEntry,
} from './manifest'

/**
 * The set of packs present in this build, and the questions core asks of them.
 *
 * "Available" is a property of the deployment; "installed" is a property of a
 * tenant (ADR 0009). The registry knows only the first — installation state
 * lives in the database, because it differs per customer.
 */
export class PackRegistry {
  private readonly packs = new Map<string, PackManifest>()

  register(manifest: PackManifest): this {
    assertValidManifest(manifest)
    if (this.packs.has(manifest.id)) throw new DuplicatePackError(manifest.id)
    this.packs.set(manifest.id, manifest)
    return this
  }

  has(id: string): boolean {
    return this.packs.has(id)
  }

  get(id: string): PackManifest {
    const pack = this.packs.get(id)
    if (pack === undefined) throw new UnknownPackError(id)
    return pack
  }

  all(): PackManifest[] {
    return [...this.packs.values()].sort((a, b) => a.id.localeCompare(b.id))
  }

  /** Permissions contributed by the installed packs, for role configuration. */
  permissionsOf(installed: readonly string[]): string[] {
    return [...new Set(installed.flatMap((id) => (this.has(id) ? [...this.get(id).permissions] : [])))]
  }

  /**
   * Navigation the caller should actually see: the pack must be installed AND
   * the user must hold the permission. Both conditions, because a pack being
   * installed says nothing about who may use it.
   */
  navigationFor(
    installed: readonly string[],
    permissions: readonly string[],
  ): PackNavigationEntry[] {
    const holds = (required: string): boolean =>
      permissions.some((granted) => {
        if (granted === '*' || granted === required) return true
        const g = granted.split(':')
        const r = required.split(':')
        return g.length === r.length && g.every((segment, i) => segment === '*' || segment === r[i])
      })

    return installed
      .filter((id) => this.has(id))
      .flatMap((id) => this.get(id).navigation)
      .filter((entry) => holds(entry.permission))
  }

  /** Tables owned by a pack — the uninstall guard counts rows in these. */
  tablesOf(id: string): readonly string[] {
    return this.get(id).tables
  }
}
