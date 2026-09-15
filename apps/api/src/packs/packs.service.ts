import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { platformScope, withScope } from '@prodx/db'
import { UnknownPackError, type PackManifest } from '@prodx/pack-sdk'
import { packRegistry } from './registry'

export type PackState = 'NOT_INSTALLED' | 'INSTALLED' | 'DISABLED'

export interface PackView {
  id: string
  name: string
  version: string
  description: string
  state: PackState
  installedVersion: string | null
  moduleCount: number
  permissionCount: number
  /** Rows this pack owns for this tenant. Zero is the only state that allows uninstall. */
  rowCount: number
}

@Injectable()
export class PacksService {
  /**
   * Every pack in the build, with this tenant's state.
   *
   * Runs on the platform scope deliberately: listing must show a DISABLED pack,
   * whose own tables are invisible under a normal scope. That is the RLS gating
   * working, and the pack manager is the one place that has to see past it.
   */
  async list(tenantId: string): Promise<PackView[]> {
    const installations = await withScope(platformScope(tenantId), (tx) =>
      tx.packInstallation.findMany(),
    )
    const byId = new Map(installations.map((i) => [i.packId, i]))

    return Promise.all(
      packRegistry.all().map(async (pack) => {
        const installed = byId.get(pack.id)
        return {
          id: pack.id,
          name: pack.name,
          version: pack.version,
          description: pack.description,
          state: installed === undefined ? ('NOT_INSTALLED' as const) : installed.status,
          installedVersion: installed?.version ?? null,
          moduleCount: pack.navigation.length,
          permissionCount: pack.permissions.length,
          rowCount: await this.countRows(tenantId, pack),
        }
      }),
    )
  }

  async install(tenantId: string, packId: string, actorId: string): Promise<void> {
    const pack = this.manifest(packId)
    await withScope(platformScope(tenantId), async (tx) => {
      const existing = await tx.packInstallation.findUnique({
        where: { tenantId_packId: { tenantId, packId } },
      })
      if (existing?.status === 'INSTALLED') {
        throw new ConflictException({
          code: 'ALREADY_INSTALLED',
          message: `${pack.name} is already installed.`,
        })
      }
      await tx.packInstallation.upsert({
        where: { tenantId_packId: { tenantId, packId } },
        create: { tenantId, packId, version: pack.version, installedById: actorId },
        // Re-enabling keeps the original installation date and its data.
        update: { status: 'INSTALLED', version: pack.version, disabledAt: null },
      })
    })
  }

  /**
   * Hides the pack without touching its data. This is the right answer for a
   * customer who has stopped a product line but still needs the history —
   * which is most of them.
   */
  async disable(tenantId: string, packId: string): Promise<void> {
    const pack = this.manifest(packId)
    await withScope(platformScope(tenantId), async (tx) => {
      const updated = await tx.packInstallation.updateMany({
        where: { tenantId, packId, status: 'INSTALLED' },
        data: { status: 'DISABLED', disabledAt: new Date() },
      })
      if (updated.count === 0) {
        throw new NotFoundException({
          code: 'NOT_INSTALLED',
          message: `${pack.name} is not installed.`,
        })
      }
    })
  }

  /**
   * Permitted only when the pack owns no rows for this tenant.
   *
   * There is no purge flag. Deleting posted manufacturing history is not an
   * operation this system offers, and an operator who wants the pack gone from
   * the UI wants `disable` — the error says so.
   */
  async uninstall(tenantId: string, packId: string): Promise<void> {
    const pack = this.manifest(packId)
    const rows = await this.countRows(tenantId, pack)
    if (rows > 0) {
      throw new BadRequestException({
        code: 'PACK_HAS_DATA',
        message:
          `${pack.name} holds ${rows} record${rows === 1 ? '' : 's'} and cannot be uninstalled. ` +
          'Disable it instead: the screens disappear and the history stays readable.',
      })
    }
    await withScope(platformScope(tenantId), async (tx) => {
      const deleted = await tx.packInstallation.deleteMany({ where: { tenantId, packId } })
      if (deleted.count === 0) {
        throw new NotFoundException({
          code: 'NOT_INSTALLED',
          message: `${pack.name} is not installed.`,
        })
      }
    })
  }

  /** Navigation contributed by this tenant's installed packs, for this user. */
  navigation(installed: readonly string[], permissions: readonly string[]) {
    return packRegistry.navigationFor(installed, permissions)
  }

  private manifest(packId: string): PackManifest {
    try {
      return packRegistry.get(packId)
    } catch (error) {
      if (error instanceof UnknownPackError) {
        throw new NotFoundException({ code: 'UNKNOWN_PACK', message: error.message })
      }
      throw error
    }
  }

  /**
   * Counted with parameterised identifiers built from the registry, never from
   * request input — the table names come from manifests validated to a strict
   * pattern, so this cannot become an injection point.
   */
  private async countRows(tenantId: string, pack: PackManifest): Promise<number> {
    return withScope(platformScope(tenantId), async (tx) => {
      let total = 0
      for (const table of pack.tables) {
        const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT count(*)::bigint AS count FROM "${table}" WHERE tenant_id = $1::uuid`,
          tenantId,
        )
        total += Number(rows[0]?.count ?? 0)
      }
      return total
    })
  }
}
