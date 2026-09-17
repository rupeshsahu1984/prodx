'use client'

import { useCallback, useEffect, useState } from 'react'
import { holds, NAV, type NavItem } from './nav'

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

interface Scoped { id: string; code: string; name: string }
interface Me {
  userId: string; email: string; displayName: string; permissions: string[]
  isSuperAdmin: boolean; plants: Scoped[]; departments: Scoped[]; packs: string[]
}
interface Line { id: string; lineNo: number; quantity: string; receivedQuantity: string; rate: string; amount: string; item: { code: string; name: string } }
interface PO { id: string; plantId: string; documentNo: string | null; state: string; totalAmount: string; supplier: { name: string }; plant: { code: string }; lines: Line[] }
interface GRN { id: string; documentNo: string | null; state: string; postingDate: string; purchaseOrder: { documentNo: string | null }; lines: { id: string; quantity: string; secondaryQuantity: string | null; amount: string; item: { code: string } }[] }
interface Stock {
  balances: unknown[]
  valuations: { id: string; quantityOnHand: string; totalValue: string; unitCost: string; item: { code: string; name: string } }[]
}
interface LedgerRow { id: string; direction: string; quantity: string; unitCost: string; totalValue: string; postingDate: string; sourceType: string; item: { code: string } }
interface JournalLine { id: string; debit: string; credit: string; glAccount: { code: string; name: string } }
interface Journal { id: string; documentNo: string; sourceType: string; lines: JournalLine[] }
interface Pack { id: string; name: string; version: string; description: string; state: 'NOT_INSTALLED' | 'INSTALLED' | 'DISABLED'; moduleCount: number; permissionCount: number; rowCount: number }
interface Tool { id: string; code: string; name: string; toolType: string; customerOwned: boolean; currentImpressions: number; lifeLimit: number | null; lifeUsedPct: number | null }
interface BoardSpec { id: string; gsm: number; burstFactor: string | null; deckleMm: number; item: { code: string; name: string } }
interface FabricSpec { id: string; gsm: number; widthInch: string; construction: string | null; item: { code: string; name: string } }
interface DyeLot { id: string; documentNo: string; colourCode: string; shadeBand: string; labDipRef: string | null; lotDate: string }
interface Weighment { gross: number; tare: number; net: number }
interface InsideVehicle { gateEventId: string; vehicleNo: string; driverName: string | null; plant: string; purchaseOrder: string | null; minutesInside: number; weighments: Weighment[] }
interface TrimPattern { combination: { orderId: string; ups: number }[]; usedMm: number; trimMm: number; trimPct: number; runMetres: number }
interface TrimResult { deckleMm: number; patterns: TrimPattern[]; averageTrimPct: number; totalMetres: number; unfulfilled: { orderId: string; remainingMetres: number }[] }
interface TokenPair { accessToken: string; refreshToken: string }

const money = (v: string | number) => `₹ ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
const qty = (v: string | number) => Number(v).toLocaleString('en-IN')

export default function Page() {
  const [token, setToken] = useState<string | null>(null)
  const [view, setView] = useState('overview')
  const [me, setMe] = useState<Me | null>(null)
  const [pos, setPos] = useState<PO[]>([])
  const [grns, setGrns] = useState<GRN[]>([])
  const [stock, setStock] = useState<Stock | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [journal, setJournal] = useState<Journal[]>([])
  const [packs, setPacks] = useState<Pack[]>([])
  const [inside, setInside] = useState<InsideVehicle[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [boards, setBoards] = useState<BoardSpec[]>([])
  const [fabrics, setFabrics] = useState<FabricSpec[]>([])
  const [dyeLots, setDyeLots] = useState<DyeLot[]>([])
  const [trim, setTrim] = useState<TrimResult | null>(null)
  const [deckle, setDeckle] = useState('1600')
  const [trimOrders, setTrimOrders] = useState('780 x 1000\n790 x 1000\n650 x 400')
  const [gateVehicle, setGateVehicle] = useState('MH12AB1234')
  const [gateDriver, setGateDriver] = useState('R. Kumar')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  // Only the group you are in stays open. With 151 modules, everything expanded
  // is a wall of text nobody reads.
  const [openGroups, setOpenGroups] = useState<string[]>(['Home & Control Tower'])

  useEffect(() => {
    try { setToken(sessionStorage.getItem('prodx.token')) } catch { /* private mode */ }
  }, [])

  function signOut() {
    try {
      sessionStorage.removeItem('prodx.token')
      sessionStorage.removeItem('prodx.refresh')
    } catch { /* ignore */ }
    setToken(null); setMe(null)
  }

  /**
   * Access tokens last fifteen minutes so a revoked role takes effect quickly.
   * On a 401 the refresh token is exchanged once and the request replayed; the
   * rotated token replaces the stored one, since keeping the old one would look
   * like reuse and revoke the whole family.
   */
  const refresh = useCallback(async (): Promise<string | null> => {
    let stored: string | null = null
    try { stored = sessionStorage.getItem('prodx.refresh') } catch { /* private mode */ }
    if (stored === null) return null
    const res = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: stored }),
    })
    if (!res.ok) return null
    const pair = (await res.json()) as TokenPair
    try {
      sessionStorage.setItem('prodx.token', pair.accessToken)
      sessionStorage.setItem('prodx.refresh', pair.refreshToken)
    } catch { /* private mode */ }
    setToken(pair.accessToken)
    return pair.accessToken
  }, [])

  const call = useCallback(
    async (path: string, init?: RequestInit): Promise<unknown> => {
      const send = (bearer: string) =>
        fetch(`${API}${path}`, {
          ...init,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}`, ...init?.headers },
        })
      let res = await send(token ?? '')
      if (res.status === 401) {
        const fresh = await refresh()
        if (fresh === null) { signOut(); throw new Error('Your session has ended. Sign in again.') }
        res = await send(fresh)
      }
      const body: unknown = res.status === 204 ? null : await res.json().catch(() => null)
      if (!res.ok) {
        const message = (body as { message?: string } | null)?.message
        throw new Error(typeof message === 'string' ? message : `Request failed (${res.status})`)
      }
      return body
    },
    [token, refresh],
  )

  const load = useCallback(async () => {
    if (token === null) return
    try {
      const [meRes, poRes, grnRes, stockRes, ledgerRes, jRes, packRes, insideRes] = await Promise.all([
        call('/me'), call('/purchase-orders'), call('/goods-receipts'), call('/stock/balances'),
        call('/stock/ledger'), call('/journal'), call('/packs'), call('/gate/inside'),
      ])
      setMe(meRes as Me); setPos(poRes as PO[]); setGrns(grnRes as GRN[])
      setStock(stockRes as Stock); setLedger(ledgerRes as LedgerRow[]); setJournal(jRes as Journal[])
      setPacks(packRes as Pack[]); setInside(insideRes as InsideVehicle[]); setError('')

      // Pack data only for packs reporting INSTALLED: a disabled pack answers
      // PACK_NOT_INSTALLED, and one failing request must not blank the page.
      const live = (packRes as Pack[]).filter((p) => p.state === 'INSTALLED').map((p) => p.id)
      if (live.includes('carton')) {
        const [t, b] = await Promise.all([call('/carton/tooling'), call('/carton/board-specs')])
        setTools(t as Tool[]); setBoards(b as BoardSpec[])
      } else { setTools([]); setBoards([]); setTrim(null) }
      if (live.includes('textile')) {
        const [f, d] = await Promise.all([call('/textile/fabric-specs'), call('/textile/dye-lots')])
        setFabrics(f as FabricSpec[]); setDyeLots(d as DyeLot[])
      } else { setFabrics([]); setDyeLots([]) }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [token, call])

  useEffect(() => { void load() }, [load])

  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setNotice('')
    try { await fn(); setNotice(message); await load() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const deviceRef = () => ({
    deviceSource: 'WEB_GATE_TERMINAL',
    deviceRef: `WEB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  })

  async function runTrim() {
    const orders = trimOrders.split('\n').map((line, i) => {
      const [w, m] = line.split(/[x×,]/).map((p) => Number(p.trim()))
      return { id: `ORD-${i + 1}`, widthMm: w ?? 0, requiredMetres: m ?? 0 }
    }).filter((o) => o.widthMm > 0 && o.requiredMetres > 0)
    setBusy(true); setError(''); setNotice('')
    try {
      setTrim((await call('/carton/trim-plans/simulate', {
        method: 'POST', body: JSON.stringify({ deckleMm: Number(deckle), orders }),
      })) as TrimResult)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  if (token === null) {
    return (
      <Login onToken={(pair) => {
        try {
          sessionStorage.setItem('prodx.token', pair.accessToken)
          sessionStorage.setItem('prodx.refresh', pair.refreshToken)
        } catch { /* private mode */ }
        setToken(pair.accessToken)
      }} />
    )
  }

  const perms = me?.permissions ?? []
  const livePacks = packs.filter((p) => p.state === 'INSTALLED').map((p) => p.id)
  const visible = (item: NavItem): boolean =>
    holds(perms, item.permission) && (item.pack === undefined || livePacks.includes(item.pack))

  const go = (id: string) => { setView(id); setMenuOpen(false); setNotice(''); setError('') }
  const current = NAV.flatMap((g) => g.items).find((i) => i.id === view)

  const query = search.trim().toLowerCase()
  const groups = NAV.map((g) => ({
    group: g.group,
    items: g.items.filter(
      (i) =>
        visible(i) &&
        (query === '' ||
          i.label.toLowerCase().includes(query) ||
          g.group.toLowerCase().includes(query)),
    ),
    built: g.items.filter((i) => visible(i) && i.planned === undefined).length,
  })).filter((g) => g.items.length > 0)

  const toggle = (group: string) =>
    setOpenGroups((open) =>
      open.includes(group) ? open.filter((g) => g !== group) : [...open, group],
    )

  return (
    <div className="shell">
      <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">☰</button>

      <aside className={`side${menuOpen ? ' open' : ''}`}>
        <div className="brand">
          <span className="mark">P</span>
          <div><strong>PRODX</strong><small>Manufacturing ERP</small></div>
        </div>

        {me !== null && (
          <div className="who">
            <b>{me.displayName}</b>
            <small>{me.email}</small>
            {me.isSuperAdmin && <span className="sa">Superadmin</span>}
            <div className="scoperow">
              {me.plants.map((p) => <span key={p.id} className="sc">{p.code}</span>)}
              {me.departments.length > 0 && me.departments.length < 4 &&
                me.departments.map((d) => <span key={d.id} className="sc dept">{d.code}</span>)}
            </div>
          </div>
        )}

        <label className="msearch" htmlFor="menusearch">
          <input
            id="menusearch"
            value={search}
            placeholder="Search 151 modules…"
            onChange={(e) => setSearch(e.target.value)}
          />
          {search !== '' && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search">×</button>
          )}
        </label>

        <nav className="menu">
          {groups.length === 0 && <p className="noresult">Nothing matches “{search}”.</p>}
          {groups.map((group) => {
            // A search opens everything it matched; otherwise the group you are in.
            const expanded =
              query !== '' ||
              openGroups.includes(group.group) ||
              group.items.some((i) => i.id === view)
            return (
              <div key={group.group} className="mgroup">
                <button
                  className={`mtitle${expanded ? ' open' : ''}`}
                  onClick={() => toggle(group.group)}
                  aria-expanded={expanded}
                >
                  <span className="caret">{expanded ? '⌄' : '›'}</span>
                  <span className="gname">{group.group}</span>
                  <span className="gcount">{group.built}/{group.items.length}</span>
                </button>
                {expanded && group.items.map((item) => (
                  <button
                    key={item.id}
                    className={`mitem${view === item.id ? ' active' : ''}${item.planned !== undefined ? ' soon' : ''}`}
                    onClick={() => go(item.id)}
                  >
                    <span>{item.label}</span>
                    {item.planned !== undefined && <em>soon</em>}
                  </button>
                ))}
              </div>
            )
          })}
        </nav>

        <button className="btn signout" onClick={signOut}>Sign out</button>
      </aside>

      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <main className="main">
        <h1>{current?.label ?? 'Overview'}</h1>
        <p className="sub">
          {me?.isSuperAdmin === true
            ? 'Every factory'
            : me?.plants.map((p) => p.code).join(', ') ?? ''}
          {' · enforced by row level security in the database'}
        </p>

        {error !== '' && <div className="err">{error}</div>}
        {notice !== '' && <div className="ok">{notice}</div>}

        {current?.planned !== undefined ? (
          <Planned item={current} />
        ) : (
          <>
            {view === 'overview' && (
              <>
                <div className="kpis">
                  <div className="kpi"><small>Purchase orders</small><b>{pos.length}</b></div>
                  <div className="kpi"><small>Receipts posted</small><b>{grns.filter((g) => g.state === 'POSTED').length}</b></div>
                  <div className="kpi"><small>Stock value</small><b style={{ fontSize: 19 }}>{money(stock?.valuations.reduce((s, v) => s + Number(v.totalValue), 0) ?? 0)}</b></div>
                  <div className="kpi"><small>Vehicles inside</small><b>{inside.length}</b></div>
                </div>
                <Panel title="Where to start" sub="Every menu item on the left opens; the ones marked “soon” say what they will hold.">
                  <ul className="steps">
                    <li><b>Purchase Orders</b> — submit a draft, then try approving it yourself. The backend refuses: whoever submits cannot approve.</li>
                    <li><b>Gate Control</b> — record an entry, weigh it, then try gate out before posting the receipt.</li>
                    <li><b>Corrugator Trim Plan</b> — type widths and metres, run the optimiser.</li>
                    <li><b>Industry Packs</b> — install textile, and its menu group appears.</li>
                  </ul>
                </Panel>
              </>
            )}

            {view === 'purchase-orders' && (
              <Panel title="Purchase orders" sub="Draft → submit → approve → release → receive. Whoever submits cannot approve.">
                {pos.length === 0 ? <Empty>Nothing visible in your scope.</Empty> : (
                  <Table head={['Document', 'Supplier', 'Plant', 'Lines', 'Value', 'State', '']}>
                    {pos.map((po) => (
                      <tr key={po.id}>
                        <td className="code">{po.documentNo ?? <span className="muted">unnumbered</span>}</td>
                        <td>{po.supplier.name}</td>
                        <td>{po.plant.code}</td>
                        <td>{po.lines.map((l) => (
                          <div key={l.id}><small><b>{l.item.code}</b> {qty(l.quantity)} @ {l.rate} · received {qty(l.receivedQuantity)}</small></div>
                        ))}</td>
                        <td className="num">{money(po.totalAmount)}</td>
                        <td><span className={`chip ${po.state}`}>{po.state.replace(/_/g, ' ')}</span></td>
                        <td>
                          <div className="pactions">
                            {po.state === 'DRAFT' && <Act busy={busy} label="Submit" primary onClick={() => act(() => call(`/purchase-orders/${po.id}/submit`, { method: 'POST' }), 'Submitted. You cannot approve your own submission.')} />}
                            {po.state === 'PENDING_APPROVAL' && <>
                              <Act busy={busy} label="Approve" primary onClick={() => act(() => call(`/purchase-orders/${po.id}/approve`, { method: 'POST', body: '{}' }), 'Approved.')} />
                              <Act busy={busy} label="Reject" onClick={() => act(() => call(`/purchase-orders/${po.id}/reject`, { method: 'POST' }), 'Rejected. Earlier signatures no longer count.')} />
                            </>}
                            {po.state === 'APPROVED' && <Act busy={busy} label="Release" primary onClick={() => act(() => call(`/purchase-orders/${po.id}/release`, { method: 'POST' }), 'Released with its document number.')} />}
                            {po.state === 'RELEASED' && <Act busy={busy} label="Receive" primary onClick={() => act(() => call(`/purchase-orders/${po.id}/receive`, { method: 'POST', body: '{}' }), 'Draft receipt created.')} />}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Panel>
            )}

            {view === 'goods-receipts' && (
              <Panel title="Goods receipts" sub="Posting moves stock, revalues the item and writes the journal — in one transaction.">
                {grns.length === 0 ? <Empty>No receipts. Use Receive on a released order.</Empty> : (
                  <Table head={['Document', 'Against', 'Date', 'Lines', 'Value', 'State', '']}>
                    {grns.map((g) => (
                      <tr key={g.id}>
                        <td className="code">{g.documentNo ?? <span className="muted">unnumbered</span>}</td>
                        <td>{g.purchaseOrder.documentNo ?? '—'}</td>
                        <td>{g.postingDate.slice(0, 10)}</td>
                        <td>{g.lines.map((l) => (
                          <div key={l.id}><small>{l.item.code} · {qty(l.quantity)}{l.secondaryQuantity !== null && <> · <b>{qty(l.secondaryQuantity)} kg measured</b></>}</small></div>
                        ))}</td>
                        <td className="num">{money(g.lines.reduce((s, l) => s + Number(l.amount), 0))}</td>
                        <td><span className={`chip ${g.state}`}>{g.state}</span></td>
                        <td>
                          <div className="pactions">
                            {g.state === 'DRAFT' && <Act busy={busy} label="Post" primary onClick={() => act(() => call(`/goods-receipts/${g.id}/post`, { method: 'POST' }), 'Posted.')} />}
                            {g.state === 'POSTED' && <Act busy={busy} label="Reverse" onClick={() => act(() => call(`/goods-receipts/${g.id}/reverse`, { method: 'POST' }), 'Reversed — balances restored exactly.')} />}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Panel>
            )}

            {view === 'stock' && (
              <Panel title="Stock & valuation" sub="Moving weighted average, maintained in the same transaction as the ledger.">
                {(stock?.valuations.length ?? 0) === 0 ? <Empty>No stock yet. Post a receipt.</Empty> : (
                  <Table head={['Item', 'On hand', 'Unit cost', 'Total value']} numFrom={1}>
                    {stock?.valuations.map((v) => (
                      <tr key={v.id}>
                        <td><b>{v.item.code}</b><br /><small className="muted">{v.item.name}</small></td>
                        <td className="num">{qty(v.quantityOnHand)}</td>
                        <td className="num">{money(v.unitCost)}</td>
                        <td className="num">{money(v.totalValue)}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Panel>
            )}

            {view === 'ledger' && (
              <Panel title="Stock ledger" sub="Append-only. Balances are a projection of this, never the other way round.">
                {ledger.length === 0 ? <Empty>No movements yet.</Empty> : (
                  <Table head={['Date', 'Item', 'Direction', 'Quantity', 'Unit cost', 'Value', 'Source']}>
                    {ledger.map((l) => (
                      <tr key={l.id}>
                        <td>{l.postingDate.slice(0, 10)}</td>
                        <td><b>{l.item.code}</b></td>
                        <td><span className={`chip ${l.direction === 'IN' ? 'POSTED' : 'DRAFT'}`}>{l.direction}</span></td>
                        <td className="num">{qty(l.quantity)}</td>
                        <td className="num">{money(l.unitCost)}</td>
                        <td className="num">{money(l.totalValue)}</td>
                        <td><small className="muted">{l.sourceType}</small></td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Panel>
            )}

            {view === 'journal' && (
              <Panel title="Journal" sub="Append-only. A correction is a reversal, never an edit.">
                {journal.length === 0 ? <Empty>Nothing posted yet.</Empty> : (
                  <Table head={['Document', 'Account', 'Debit', 'Credit', 'Source']}>
                    {journal.flatMap((j) => j.lines.map((l, i) => (
                      <tr key={l.id}>
                        {i === 0 ? <td rowSpan={j.lines.length} className="code">{j.documentNo}</td> : null}
                        <td>{l.glAccount.code}<br /><small className="muted">{l.glAccount.name}</small></td>
                        <td className="num">{Number(l.debit) === 0 ? '—' : money(l.debit)}</td>
                        <td className="num">{Number(l.credit) === 0 ? '—' : money(l.credit)}</td>
                        {i === 0 ? <td rowSpan={j.lines.length}><small className="muted">{j.sourceType}</small></td> : null}
                      </tr>
                    )))}
                  </Table>
                )}
              </Panel>
            )}

            {view === 'gate' && (
              <Panel title="Gate control" sub="Every call carries the device's own reference and is idempotent on it — a double-tap cannot create a second event.">
                <div className="gatebar">
                  <label htmlFor="veh">Vehicle<input id="veh" value={gateVehicle} onChange={(e) => setGateVehicle(e.target.value)} /></label>
                  <label htmlFor="drv">Driver<input id="drv" value={gateDriver} onChange={(e) => setGateDriver(e.target.value)} /></label>
                  <Act busy={busy} label="Gate in" primary onClick={() => act(() => call('/gate/in', {
                    method: 'POST',
                    body: JSON.stringify({ ...deviceRef(), vehicleNo: gateVehicle, driverName: gateDriver, plantId: pos[0]?.plantId ?? '', purchaseOrderId: pos.find((p) => p.state === 'RELEASED')?.id }),
                  }), `${gateVehicle} recorded at the gate.`)} />
                </div>
                {inside.length === 0 ? <Empty>No vehicles inside.</Empty> : (
                  <Table head={['Vehicle', 'Against', 'Inside', 'Weighments', '']}>
                    {inside.map((v) => (
                      <tr key={v.gateEventId}>
                        <td><b className="code">{v.vehicleNo}</b>{v.driverName !== null && <><br /><small className="muted">{v.driverName}</small></>}</td>
                        <td>{v.purchaseOrder ?? <small className="muted">no order</small>}</td>
                        <td className="num" style={{ color: v.minutesInside > 120 ? 'var(--red)' : 'inherit' }}>{v.minutesInside} min</td>
                        <td>{v.weighments.length === 0 ? <small className="muted">not weighed</small> : v.weighments.map((w, i) => (
                          <div key={i}><small>gross {qty(w.gross)} · tare {qty(w.tare)} · <b>net {qty(w.net)} kg</b></small></div>
                        ))}</td>
                        <td><div className="pactions">
                          <Act busy={busy} label="Weigh" onClick={() => act(() => call('/gate/weigh', {
                            method: 'POST', body: JSON.stringify({ ...deviceRef(), gateEventId: v.gateEventId, grossWeight: 31200, tareWeight: 7200 }),
                          }), 'Weighed — net 24,000 kg.')} />
                          <Act busy={busy} label="Gate out" onClick={() => act(() => call('/gate/out', {
                            method: 'POST', body: JSON.stringify({ ...deviceRef(), vehicleNo: v.vehicleNo, plantId: pos[0]?.plantId ?? '' }),
                          }), `${v.vehicleNo} cleared.`)} />
                        </div></td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Panel>
            )}

            {view === 'carton-board' && (
              <Panel title="Board / paper specification" sub="From the carton pack. Disable the pack and this screen disappears.">
                {boards.length === 0 ? <Empty>No board specifications.</Empty> : (
                  <Table head={['Board', 'GSM', 'BF', 'Deckle']} numFrom={1}>
                    {boards.map((b) => (
                      <tr key={b.id}>
                        <td><b>{b.item.code}</b><br /><small className="muted">{b.item.name}</small></td>
                        <td className="num">{b.gsm}</td>
                        <td className="num">{b.burstFactor ?? '—'}</td>
                        <td className="num">{b.deckleMm} mm</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Panel>
            )}

            {view === 'carton-tooling' && (
              <Panel title="Die / plate / tooling" sub="A die that runs past its life makes scrap before anyone notices; the counter is the only warning.">
                {tools.length === 0 ? <Empty>No tooling.</Empty> : (
                  <Table head={['Tool', 'Type', 'Impressions', 'Life used']}>
                    {tools.map((t) => (
                      <tr key={t.id}>
                        <td><b>{t.code}</b><br /><small className="muted">{t.name}</small></td>
                        <td>{t.toolType.replace(/_/g, ' ').toLowerCase()}{t.customerOwned && <><br /><small>customer owned</small></>}</td>
                        <td className="num">{qty(t.currentImpressions)}{t.lifeLimit !== null && <> / {qty(t.lifeLimit)}</>}</td>
                        <td className="num" style={{ color: (t.lifeUsedPct ?? 0) > 80 ? 'var(--red)' : 'inherit', fontWeight: (t.lifeUsedPct ?? 0) > 80 ? 700 : 400 }}>
                          {t.lifeUsedPct === null ? '—' : `${t.lifeUsedPct}%`}
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Panel>
            )}

            {view === 'carton-trim' && (
              <Panel title="Corrugator trim plan" sub="Combining orders across the deck is where the money is. One line per order: width × metres.">
                <div className="trimform">
                  <label htmlFor="deckle">Deckle (mm)<input id="deckle" value={deckle} onChange={(e) => setDeckle(e.target.value)} /></label>
                  <label htmlFor="orders">Orders<textarea id="orders" rows={4} value={trimOrders} onChange={(e) => setTrimOrders(e.target.value)} /></label>
                  <Act busy={busy} label={busy ? 'Planning…' : 'Run optimiser'} primary onClick={() => void runTrim()} />
                </div>
                {trim !== null && (
                  <>
                    <div className="kpis">
                      <div className="kpi"><small>Weighted trim</small><b>{trim.averageTrimPct}%</b></div>
                      <div className="kpi"><small>Set-ups</small><b>{trim.patterns.length}</b></div>
                      <div className="kpi"><small>Metres planned</small><b>{qty(trim.totalMetres)}</b></div>
                    </div>
                    <Table head={['Lay-up', 'Used', 'Trim', 'Run']} numFrom={1}>
                      {trim.patterns.map((p, i) => (
                        <tr key={i}>
                          <td>{p.combination.map((c) => `${c.orderId} ×${c.ups}`).join('  +  ')}</td>
                          <td className="num">{p.usedMm} mm</td>
                          <td className="num">{p.trimMm} mm ({p.trimPct}%)</td>
                          <td className="num">{qty(p.runMetres)} m</td>
                        </tr>
                      ))}
                    </Table>
                    {trim.unfulfilled.length > 0 && (
                      <div className="warn">
                        Not coverable within the trim limit: {trim.unfulfilled.map((u) => `${u.orderId} (${u.remainingMetres} m)`).join(', ')}.
                        The planner says so rather than reporting a plan that leaves them short.
                      </div>
                    )}
                  </>
                )}
              </Panel>
            )}

            {view === 'textile-fabric' && (
              <Panel title="Fabric specification" sub="From the textile pack.">
                {fabrics.length === 0 ? <Empty>No fabric specifications yet.</Empty> : (
                  <Table head={['Fabric', 'GSM', 'Width', 'Construction']} numFrom={1}>
                    {fabrics.map((f) => (
                      <tr key={f.id}>
                        <td><b>{f.item.code}</b><br /><small className="muted">{f.item.name}</small></td>
                        <td className="num">{f.gsm}</td>
                        <td className="num">{f.widthInch}&quot;</td>
                        <td>{f.construction ?? '—'}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Panel>
            )}

            {view === 'textile-dyelots' && (
              <Panel title="Dyeing batch & shade band" sub="A garment cut across shade bands shows a mismatched panel. Allocation has to respect the band.">
                {dyeLots.length === 0 ? <Empty>No dye lots yet.</Empty> : (
                  <Table head={['Dye lot', 'Colour', 'Shade band', 'Lab dip']}>
                    {dyeLots.map((d) => (
                      <tr key={d.id}>
                        <td className="code">{d.documentNo}</td>
                        <td>{d.colourCode}</td>
                        <td><span className="band">{d.shadeBand}</span></td>
                        <td>{d.labDipRef ?? <span style={{ color: 'var(--red)' }}>not approved</span>}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Panel>
            )}

            {view === 'packs' && (
              <Panel title="Industry packs" sub="The core ERP is industry-neutral. A pack's data is hidden by the database itself when the pack is off.">
                <div className="packs">
                  {packs.map((p) => (
                    <article key={p.id} className={`pack ${p.state}`}>
                      <header>
                        <div><b>{p.name}</b><small>v{p.version} · {p.moduleCount} modules · {p.permissionCount} permissions</small></div>
                        <span className={`chip ${p.state}`}>{p.state.replace(/_/g, ' ')}</span>
                      </header>
                      <p>{p.description}</p>
                      <footer>
                        <small>{p.rowCount === 0 ? 'No records yet' : `${p.rowCount} record${p.rowCount === 1 ? '' : 's'} — uninstall refused, disable instead`}</small>
                        <div className="pactions">
                          {p.state !== 'INSTALLED' && <Act busy={busy} primary label={p.state === 'DISABLED' ? 'Re-enable' : 'Install'} onClick={() => act(() => call(`/packs/${p.id}/install`, { method: 'POST' }), `${p.name} installed. Sign out and back in to pick up its permissions.`)} />}
                          {p.state === 'INSTALLED' && <Act busy={busy} label="Disable" onClick={() => act(() => call(`/packs/${p.id}/disable`, { method: 'POST' }), `${p.name} disabled. Its data is kept and hidden.`)} />}
                          {p.state !== 'NOT_INSTALLED' && <Act busy={busy} label="Uninstall" onClick={() => act(() => call(`/packs/${p.id}`, { method: 'DELETE' }), `${p.name} uninstalled.`)} />}
                        </div>
                      </footer>
                    </article>
                  ))}
                </div>
              </Panel>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="phead"><div><h2>{title}</h2>{sub !== undefined && <small>{sub}</small>}</div></div>
      {children}
    </section>
  )
}

function Table({ head, children, numFrom }: { head: string[]; children: React.ReactNode; numFrom?: number }) {
  return (
    <div className="tscroll"><table>
      <thead><tr>{head.map((h, i) => <th key={h + String(i)} className={numFrom !== undefined && i >= numFrom ? 'num' : ''}>{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table></div>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => <div className="empty">{children}</div>

function Act({ label, onClick, primary, busy }: { label: string; onClick: () => void; primary?: boolean; busy: boolean }) {
  return <button className={`btn${primary === true ? ' primary' : ''}`} disabled={busy} onClick={onClick}>{label}</button>
}

/** An honest placeholder. A menu item that does nothing is worse than one that says so. */
function Planned({ item }: { item: NavItem }) {
  return (
    <section className="panel planned">
      <h2>{item.label}</h2>
      <p className="tag">Not built yet</p>
      <p>{item.planned}</p>
      <p className="muted">
        The engines this screen needs — documents, workflow, approvals, posting, audit — are
        built and tested. What is missing is this screen and its endpoints, not the machinery
        underneath.
      </p>
    </section>
  )
}

const DEMO_USERS = [
  { email: 'admin@prodx.demo', label: 'Superadmin', detail: 'Both factories' },
  { email: 'carton.head@prodx.demo', label: 'Carton Plant Head', detail: 'Carton Plant only' },
  { email: 'textile.head@prodx.demo', label: 'Textile Plant Head', detail: 'Textile Plant only' },
  { email: 'carton.stores@prodx.demo', label: 'Store Executive', detail: 'Carton Plant · Stores' },
] as const

function Login({ onToken }: { onToken: (pair: TokenPair) => void }) {
  const [tenantCode, setTenantCode] = useState('DEMO')
  const [email, setEmail] = useState<string>(DEMO_USERS[0].email)
  const [password, setPassword] = useState('prodx-demo-2026')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn(withEmail: string) {
    setBusy(true); setError('')
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantCode, email: withEmail, password }),
      })
      const body: unknown = await res.json().catch(() => null)
      if (!res.ok) throw new Error((body as { message?: string } | null)?.message ?? 'Sign in failed')
      onToken(body as TokenPair)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={(e) => { e.preventDefault(); void signIn(email) }}>
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="mark">P</span>
          <div><strong>PRODX</strong><small>Manufacturing ERP</small></div>
        </div>
        <h1>Sign in</h1>
        {error !== '' && <div className="err" style={{ marginTop: 14 }}>{error}</div>}
        <label htmlFor="tenant">Tenant code</label>
        <input id="tenant" value={tenantCode} onChange={(e) => setTenantCode(e.target.value)} />
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn primary" style={{ width: '100%', marginTop: 18, padding: 10 }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="hint">
          <b style={{ color: 'var(--ink)' }}>Demo users</b> — one click each. The two plant heads
          hold the same role and see different data.
          <div className="users">
            {DEMO_USERS.map((u) => (
              <button key={u.email} type="button" className="user" disabled={busy}
                onClick={() => { setEmail(u.email); void signIn(u.email) }}>
                <b>{u.label}</b><small>{u.detail}</small>
              </button>
            ))}
          </div>
        </div>
      </form>
    </div>
  )
}
