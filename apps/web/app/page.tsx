'use client'

import { useCallback, useEffect, useState } from 'react'

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

interface Scoped { id: string; code: string; name: string }
interface Me {
  userId: string; email: string; displayName: string; permissions: string[]
  isSuperAdmin: boolean; plants: Scoped[]; departments: Scoped[]
}

/**
 * The 15 domains of the prototype. `live` marks what is actually wired to the
 * database today — the rest is the roadmap, shown rather than hidden so the
 * shape of the product is visible from the first screen.
 */
const DOMAINS: { name: string; modules: number; live?: number; perm?: string }[] = [
  { name: 'Home & Control Tower', modules: 4 },
  { name: 'Enterprise & Master Data', modules: 8, live: 3 },
  { name: 'CRM, Costing & Sales', modules: 8 },
  { name: 'Planning & Scheduling', modules: 8 },
  { name: 'Procurement & Supplier', modules: 8, live: 3, perm: 'purchase_order:read' },
  { name: 'Inventory, Warehouse & Logistics', modules: 10, live: 2, perm: 'stock:read' },
  { name: 'Gate, Security & Weighbridge', modules: 12, perm: 'gate:read' },
  { name: 'Shared Manufacturing & MES', modules: 10 },
  { name: 'Textile Manufacturing Pack', modules: 12 },
  { name: 'Carton & Corrugated Pack', modules: 12 },
  { name: 'Quality Management', modules: 9 },
  { name: 'Maintenance & Utilities', modules: 8 },
  { name: 'Finance, Cost & Compliance', modules: 15, live: 1, perm: 'stock:read' },
  { name: 'People, Safety & Sustainability', modules: 17 },
  { name: 'Reports, AI & Administration', modules: 10 },
]
interface Line { id: string; lineNo: number; quantity: string; receivedQuantity: string; rate: string; amount: string; item: { code: string; name: string } }
interface PO { id: string; documentNo: string; state: string; totalAmount: string; supplier: { name: string }; plant: { code: string }; lines: Line[] }
interface GRN { id: string; documentNo: string; state: string; postingDate: string; purchaseOrder: { documentNo: string }; lines: { id: string; quantity: string; amount: string; item: { code: string } }[] }
interface Stock {
  balances: { id: string; quantity: string; stockUnit: { reference: string; item: { code: string; name: string } }; storageLocation: { code: string } }[]
  valuations: { id: string; quantityOnHand: string; totalValue: string; unitCost: string; item: { code: string; name: string } }[]
}
interface JournalLine { id: string; debit: string; credit: string; glAccount: { code: string; name: string } }
interface Pack {
  id: string; name: string; version: string; description: string
  state: 'NOT_INSTALLED' | 'INSTALLED' | 'DISABLED'
  moduleCount: number; permissionCount: number; rowCount: number
}
interface NavEntry { group: string; label: string; path: string; permission: string }
interface Tool { id: string; code: string; name: string; toolType: string; customerOwned: boolean; currentImpressions: number; lifeLimit: number | null; lifeUsedPct: number | null }
interface BoardSpec { id: string; gsm: number; burstFactor: string | null; deckleMm: number; item: { code: string; name: string } }
interface DyeLot { id: string; documentNo: string; colourCode: string; shadeBand: string; labDipRef: string | null; lotDate: string }
interface FabricSpec { id: string; gsm: number; widthInch: string; construction: string | null; item: { code: string; name: string } }
interface TrimSlot { orderId: string; ups: number }
interface TrimPattern { combination: TrimSlot[]; usedMm: number; trimMm: number; trimPct: number; runMetres: number }
interface TrimResult { deckleMm: number; patterns: TrimPattern[]; averageTrimPct: number; totalMetres: number; unfulfilled: { orderId: string; remainingMetres: number }[] }
interface Journal { id: string; documentNo: string; narration: string | null; sourceType: string; lines: JournalLine[] }

const money = (v: string) => `₹ ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
const qty = (v: string) => Number(v).toLocaleString('en-IN')

export default function Page() {
  const [token, setToken] = useState<string | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [pos, setPos] = useState<PO[]>([])
  const [grns, setGrns] = useState<GRN[]>([])
  const [stock, setStock] = useState<Stock | null>(null)
  const [journal, setJournal] = useState<Journal[]>([])
  const [packs, setPacks] = useState<Pack[]>([])
  const [packNav, setPackNav] = useState<NavEntry[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [boards, setBoards] = useState<BoardSpec[]>([])
  const [dyeLots, setDyeLots] = useState<DyeLot[]>([])
  const [fabrics, setFabrics] = useState<FabricSpec[]>([])
  const [trim, setTrim] = useState<TrimResult | null>(null)
  const [deckle, setDeckle] = useState('1600')
  const [trimOrders, setTrimOrders] = useState('780 x 1000\n790 x 1000\n650 x 400')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try { setToken(sessionStorage.getItem('prodx.token')) } catch { /* private mode */ }
  }, [])

  const call = useCallback(
    async (path: string, init?: RequestInit): Promise<unknown> => {
      const res = await fetch(`${API}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}`, ...init?.headers },
      })
      const body: unknown = res.status === 204 ? null : await res.json().catch(() => null)
      if (!res.ok) {
        const message = (body as { message?: string } | null)?.message
        throw new Error(typeof message === 'string' ? message : `Request failed (${res.status})`)
      }
      return body
    },
    [token],
  )

  const load = useCallback(async () => {
    if (token === null) return
    try {
      const [meRes, poRes, grnRes, stockRes, jRes, packRes, navRes] = await Promise.all([
        call('/me'), call('/purchase-orders'), call('/goods-receipts'), call('/stock/balances'),
        call('/journal'), call('/packs'), call('/packs/navigation'),
      ])
      setMe(meRes as Me); setPos(poRes as PO[]); setGrns(grnRes as GRN[])
      setStock(stockRes as Stock); setJournal(jRes as Journal[])
      setPacks(packRes as Pack[]); setPackNav(navRes as NavEntry[]); setError('')

      // Pack data is fetched only when the pack is on. A disabled pack would
      // return PACK_NOT_INSTALLED, and one failing request must not blank the page.
      const live = (packRes as Pack[]).filter((p) => p.state === 'INSTALLED').map((p) => p.id)
      if (live.includes('carton')) {
        const [t, b] = await Promise.all([call('/carton/tooling'), call('/carton/board-specs')])
        setTools(t as Tool[]); setBoards(b as BoardSpec[])
      } else { setTools([]); setBoards([]); setTrim(null) }
      if (live.includes('textile')) {
        const [d, f] = await Promise.all([call('/textile/dye-lots'), call('/textile/fabric-specs')])
        setDyeLots(d as DyeLot[]); setFabrics(f as FabricSpec[])
      } else { setDyeLots([]); setFabrics([]) }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      if (String(e).includes('401') || String(e).includes('valid')) signOut()
    }
  }, [token, call])

  useEffect(() => { void load() }, [load])

  function signOut() {
    try { sessionStorage.removeItem('prodx.token') } catch { /* ignore */ }
    setToken(null); setMe(null)
  }

  async function runTrim() {
    // "780 x 1000" — width in millimetres, metres required.
    const orders = trimOrders.split('\n').map((line, i) => {
      const [w, m] = line.split(/[x×,]/).map((part) => Number(part.trim()))
      return { id: `ORD-${i + 1}`, widthMm: w ?? 0, requiredMetres: m ?? 0 }
    }).filter((o) => o.widthMm > 0 && o.requiredMetres > 0)

    setBusy(true); setError(''); setNotice('')
    try {
      const result = await call('/carton/trim-plans/simulate', {
        method: 'POST',
        body: JSON.stringify({ deckleMm: Number(deckle), orders }),
      })
      setTrim(result as TrimResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setNotice('')
    try { await fn(); setNotice(message); await load() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  if (token === null) return <Login onToken={(t) => { try { sessionStorage.setItem('prodx.token', t) } catch { /* ignore */ } setToken(t) }} />

  const posted = grns.filter((g) => g.state === 'POSTED').length
  const stockValue = stock?.valuations.reduce((s, v) => s + Number(v.totalValue), 0) ?? 0

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="mark">P</span>
          <div><strong>PRODX</strong><small>Manufacturing ERP</small></div>
        </div>
        {me !== null && (
          <>
            <div className="who">
              <b>{me.displayName}</b>
              <small>{me.email}</small>
              {me.isSuperAdmin && <span className="sa">Superadmin — all factories</span>}
              <div className="perm">{me.permissions.map((p) => <span key={p}>{p}</span>)}</div>
            </div>

            <div className="scope">
              <h3>Factories</h3>
              {me.plants.map((p) => <div key={p.id} className="sitem"><b>{p.code}</b><small>{p.name}</small></div>)}
              <h3 style={{ marginTop: 14 }}>Departments</h3>
              <div className="dchips">
                {me.departments.length === 0
                  ? <small style={{ color: '#8aa4ad' }}>none</small>
                  : [...new Set(me.departments.map((d) => d.code))].map((c) => <span key={c}>{c}</span>)}
              </div>
            </div>

            {packNav.length > 0 && (
              <div className="scope">
                <h3>From installed packs</h3>
                {[...new Set(packNav.map((n) => n.group))].map((group) => (
                  <div key={group} style={{ marginBottom: 10 }}>
                    <div className="ngroup">{group}</div>
                    {packNav.filter((n) => n.group === group).map((n) => (
                      <div key={n.path} className="nleaf">{n.label}</div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <nav className="nav">
              {DOMAINS.map((d) => {
                const visible = d.perm === undefined || me.permissions.some((p) => p === '*' || p === d.perm || p.endsWith(':*') && d.perm?.startsWith(p.slice(0, -1)))
                return (
                  <div key={d.name} className={`nrow${visible ? '' : ' dim'}`}>
                    <span>{d.name}</span>
                    <b>{d.live === undefined ? d.modules : `${d.live}/${d.modules}`}</b>
                  </div>
                )
              })}
            </nav>
          </>
        )}
        <button className="btn" onClick={signOut} style={{ marginTop: 'auto' }}>Sign out</button>
      </aside>

      <main className="main">
        <h1>Procure to Receive</h1>
        <p className="sub">
          Live data from PostgreSQL. You are seeing{' '}
          <b>{me?.isSuperAdmin === true ? 'every factory' : me?.plants.map((p) => p.code).join(', ')}</b>
          {' '}— enforced by row level security in the database, not by a filter in this page.
        </p>

        {error !== '' && <div className="err">{error}</div>}
        {notice !== '' && <div className="ok">{notice}</div>}

        <div className="kpis">
          <div className="kpi"><small>Purchase orders</small><b>{pos.length}</b></div>
          <div className="kpi"><small>Receipts posted</small><b>{posted}</b></div>
          <div className="kpi"><small>Stock value</small><b style={{ fontSize: 19 }}>{money(String(stockValue))}</b></div>
          <div className="kpi"><small>Journal entries</small><b>{journal.length}</b></div>
        </div>

        <section className="panel">
          <div className="phead"><div><h2>Purchase orders</h2><small>Receive creates a draft for everything still outstanding</small></div></div>
          {pos.length === 0 ? <div className="empty">No purchase orders.</div> : (
            <table>
              <thead><tr><th>Document</th><th>Supplier</th><th>Item</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Amount</th><th>State</th><th></th></tr></thead>
              <tbody>
                {pos.map((po) => po.lines.map((line, i) => (
                  <tr key={line.id}>
                    {i === 0 && <td rowSpan={po.lines.length} className="code">{po.documentNo}</td>}
                    {i === 0 && <td rowSpan={po.lines.length}>{po.supplier.name}</td>}
                    <td><b>{line.item.code}</b><br /><small style={{ color: 'var(--muted)' }}>{line.item.name}</small></td>
                    <td className="num">{qty(line.quantity)}</td>
                    <td className="num">{qty(line.receivedQuantity)}</td>
                    <td className="num">{money(line.amount)}</td>
                    {i === 0 && <td rowSpan={po.lines.length}><span className={`chip ${po.state}`}>{po.state}</span></td>}
                    {i === 0 && (
                      <td rowSpan={po.lines.length}>
                        <button className="btn primary" disabled={busy}
                          onClick={() => act(() => call(`/purchase-orders/${po.id}/receive`, { method: 'POST', body: '{}' }), 'Draft receipt created.')}>
                          Receive
                        </button>
                      </td>
                    )}
                  </tr>
                )))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <div className="phead"><div><h2>Goods receipts</h2><small>Posting moves stock, revalues the item and writes the journal — in one transaction</small></div></div>
          {grns.length === 0 ? <div className="empty">No receipts yet. Use Receive above.</div> : (
            <table>
              <thead><tr><th>Document</th><th>Against</th><th>Posting date</th><th className="num">Lines</th><th className="num">Value</th><th>State</th><th></th></tr></thead>
              <tbody>
                {grns.map((g) => (
                  <tr key={g.id}>
                    <td className="code">{g.documentNo === '' ? '—' : g.documentNo}</td>
                    <td>{g.purchaseOrder.documentNo}</td>
                    <td>{g.postingDate.slice(0, 10)}</td>
                    <td className="num">{g.lines.length}</td>
                    <td className="num">{money(String(g.lines.reduce((s, l) => s + Number(l.amount), 0)))}</td>
                    <td><span className={`chip ${g.state}`}>{g.state}</span></td>
                    <td>
                      {g.state === 'DRAFT' && (
                        <button className="btn primary" disabled={busy}
                          onClick={() => act(() => call(`/goods-receipts/${g.id}/post`, { method: 'POST' }), 'Receipt posted.')}>Post</button>
                      )}
                      {g.state === 'POSTED' && (
                        <button className="btn" disabled={busy}
                          onClick={() => act(() => call(`/goods-receipts/${g.id}/reverse`, { method: 'POST' }), 'Receipt reversed — balances restored.')}>Reverse</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <div className="phead"><div><h2>Stock &amp; valuation</h2><small>Moving weighted average, maintained in the same transaction as the ledger</small></div></div>
          {(stock?.valuations.length ?? 0) === 0 ? <div className="empty">No stock yet. Post a receipt.</div> : (
            <table>
              <thead><tr><th>Item</th><th className="num">On hand</th><th className="num">Unit cost</th><th className="num">Total value</th></tr></thead>
              <tbody>
                {stock?.valuations.map((v) => (
                  <tr key={v.id}>
                    <td><b>{v.item.code}</b><br /><small style={{ color: 'var(--muted)' }}>{v.item.name}</small></td>
                    <td className="num">{qty(v.quantityOnHand)}</td>
                    <td className="num">{money(v.unitCost)}</td>
                    <td className="num">{money(v.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {tools.length + boards.length > 0 && (
          <section className="panel">
            <div className="phead">
              <div>
                <h2>Corrugated carton</h2>
                <small>From the carton pack — these tables and screens disappear if it is disabled</small>
              </div>
            </div>
            <div className="tscroll"><table>
              <thead><tr><th>Board</th><th className="num">GSM</th><th className="num">BF</th><th className="num">Deckle</th></tr></thead>
              <tbody>
                {boards.map((b) => (
                  <tr key={b.id}>
                    <td><b>{b.item.code}</b><br /><small style={{ color: 'var(--muted)' }}>{b.item.name}</small></td>
                    <td className="num">{b.gsm}</td>
                    <td className="num">{b.burstFactor ?? '—'}</td>
                    <td className="num">{b.deckleMm} mm</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="tscroll"><table>
              <thead><tr><th>Tool</th><th>Type</th><th className="num">Impressions</th><th className="num">Life used</th></tr></thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t.id}>
                    <td><b>{t.code}</b><br /><small style={{ color: 'var(--muted)' }}>{t.name}</small></td>
                    <td>{t.toolType.replace(/_/g, ' ').toLowerCase()}{t.customerOwned && <><br /><small>customer owned</small></>}</td>
                    <td className="num">{t.currentImpressions.toLocaleString('en-IN')}{t.lifeLimit !== null && <> / {t.lifeLimit.toLocaleString('en-IN')}</>}</td>
                    <td className="num">
                      {t.lifeUsedPct === null ? '—' : (
                        <span style={{ color: t.lifeUsedPct > 80 ? 'var(--red)' : 'inherit', fontWeight: t.lifeUsedPct > 80 ? 700 : 400 }}>
                          {t.lifeUsedPct}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>

            <div className="trim">
              <h3>Corrugator trim planner</h3>
              <p>
                Combining orders across the deck is where the money is. One line per order:
                <code> width × metres</code>.
              </p>
              <div className="trimform">
                <label htmlFor="deckle">Deckle (mm)
                  <input id="deckle" value={deckle} onChange={(e) => setDeckle(e.target.value)} />
                </label>
                <label htmlFor="orders">Orders
                  <textarea id="orders" rows={4} value={trimOrders} onChange={(e) => setTrimOrders(e.target.value)} />
                </label>
                <button className="btn primary" disabled={busy} onClick={() => void runTrim()}>
                  {busy ? 'Planning…' : 'Run optimiser'}
                </button>
              </div>
              {trim !== null && (
                <div className="trimout">
                  <div className="kpis" style={{ marginBottom: 12 }}>
                    <div className="kpi"><small>Weighted trim</small><b>{trim.averageTrimPct}%</b></div>
                    <div className="kpi"><small>Set-ups</small><b>{trim.patterns.length}</b></div>
                    <div className="kpi"><small>Metres planned</small><b>{trim.totalMetres.toLocaleString('en-IN')}</b></div>
                  </div>
                  <table>
                    <thead><tr><th>Lay-up</th><th className="num">Used</th><th className="num">Trim</th><th className="num">Run</th></tr></thead>
                    <tbody>
                      {trim.patterns.map((p, i) => (
                        <tr key={i}>
                          <td>{p.combination.map((c) => `${c.orderId} ×${c.ups}`).join('  +  ')}</td>
                          <td className="num">{p.usedMm} mm</td>
                          <td className="num">{p.trimMm} mm ({p.trimPct}%)</td>
                          <td className="num">{p.runMetres.toLocaleString('en-IN')} m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {trim.unfulfilled.length > 0 && (
                    <div className="warn">
                      Not coverable within the trim limit:{' '}
                      {trim.unfulfilled.map((u) => `${u.orderId} (${u.remainingMetres} m)`).join(', ')}.
                      The planner says so rather than reporting a plan that leaves them short.
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {dyeLots.length + fabrics.length > 0 && (
          <section className="panel">
            <div className="phead">
              <div>
                <h2>Textile &amp; garment</h2>
                <small>From the textile pack — shade band is what allocation has to respect</small>
              </div>
            </div>
            <div className="tscroll"><table>
              <thead><tr><th>Fabric</th><th className="num">GSM</th><th className="num">Width</th><th>Construction</th></tr></thead>
              <tbody>
                {fabrics.map((f) => (
                  <tr key={f.id}>
                    <td><b>{f.item.code}</b><br /><small style={{ color: 'var(--muted)' }}>{f.item.name}</small></td>
                    <td className="num">{f.gsm}</td>
                    <td className="num">{f.widthInch}"</td>
                    <td>{f.construction ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="tscroll"><table>
              <thead><tr><th>Dye lot</th><th>Colour</th><th>Shade band</th><th>Lab dip</th></tr></thead>
              <tbody>
                {dyeLots.map((d) => (
                  <tr key={d.id}>
                    <td className="code">{d.documentNo}</td>
                    <td>{d.colourCode}</td>
                    <td><span className="band">{d.shadeBand}</span></td>
                    <td>{d.labDipRef ?? <span style={{ color: 'var(--red)' }}>not approved</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>
        )}

        <section className="panel">
          <div className="phead">
            <div>
              <h2>Industry packs</h2>
              <small>
                The core ERP is industry-neutral. A pack adds its own screens, permissions and
                tables — and its data is hidden by the database itself when the pack is off.
              </small>
            </div>
          </div>
          {packs.length === 0 ? <div className="empty">No packs in this build.</div> : (
            <div className="packs">
              {packs.map((p) => (
                <article key={p.id} className={`pack ${p.state}`}>
                  <header>
                    <div>
                      <b>{p.name}</b>
                      <small>v{p.version} · {p.moduleCount} modules · {p.permissionCount} permissions</small>
                    </div>
                    <span className={`chip ${p.state}`}>{p.state.replace('_', ' ')}</span>
                  </header>
                  <p>{p.description}</p>
                  <footer>
                    <small>
                      {p.rowCount === 0
                        ? 'No records yet'
                        : `${p.rowCount} record${p.rowCount === 1 ? '' : 's'} — uninstall is refused, disable instead`}
                    </small>
                    <div className="pactions">
                      {p.state !== 'INSTALLED' && (
                        <button className="btn primary" disabled={busy}
                          onClick={() => act(() => call(`/packs/${p.id}/install`, { method: 'POST' }),
                            `${p.name} installed. Sign out and back in to pick up its permissions.`)}>
                          {p.state === 'DISABLED' ? 'Re-enable' : 'Install'}
                        </button>
                      )}
                      {p.state === 'INSTALLED' && (
                        <button className="btn" disabled={busy}
                          onClick={() => act(() => call(`/packs/${p.id}/disable`, { method: 'POST' }),
                            `${p.name} disabled. Its data is kept and hidden.`)}>
                          Disable
                        </button>
                      )}
                      {p.state !== 'NOT_INSTALLED' && (
                        <button className="btn" disabled={busy}
                          onClick={() => act(() => call(`/packs/${p.id}`, { method: 'DELETE' }),
                            `${p.name} uninstalled.`)}>
                          Uninstall
                        </button>
                      )}
                    </div>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="phead"><div><h2>Journal</h2><small>Append-only. A correction is a reversal, never an edit.</small></div></div>
          {journal.length === 0 ? <div className="empty">Nothing posted yet.</div> : (
            <table>
              <thead><tr><th>Document</th><th>Account</th><th className="num">Debit</th><th className="num">Credit</th><th>Source</th></tr></thead>
              <tbody>
                {journal.map((j) => j.lines.map((l, i) => (
                  <tr key={l.id}>
                    {i === 0 && <td rowSpan={j.lines.length} className="code">{j.documentNo}</td>}
                    <td>{l.glAccount.code}<br /><small style={{ color: 'var(--muted)' }}>{l.glAccount.name}</small></td>
                    <td className="num">{Number(l.debit) === 0 ? '—' : money(l.debit)}</td>
                    <td className="num">{Number(l.credit) === 0 ? '—' : money(l.credit)}</td>
                    {i === 0 && <td rowSpan={j.lines.length}><small>{j.sourceType}</small></td>}
                  </tr>
                )))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  )
}

const DEMO_USERS = [
  { email: 'admin@prodx.demo', label: 'Superadmin', detail: 'Both factories' },
  { email: 'carton.head@prodx.demo', label: 'Carton Plant Head', detail: 'Carton Plant only' },
  { email: 'textile.head@prodx.demo', label: 'Textile Plant Head', detail: 'Textile Plant only' },
  { email: 'carton.stores@prodx.demo', label: 'Store Executive', detail: 'Carton Plant · Stores' },
] as const

function Login({ onToken }: { onToken: (token: string) => void }) {
  const [tenantCode, setTenantCode] = useState('DEMO')
  const [email, setEmail] = useState<string>(DEMO_USERS[0].email)
  const [password, setPassword] = useState('prodx-demo-2026')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn(withEmail: string) {
    setBusy(true); setError('')
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantCode, email: withEmail, password }),
      })
      const body: unknown = await res.json().catch(() => null)
      if (!res.ok) throw new Error((body as { message?: string } | null)?.message ?? 'Sign in failed')
      onToken((body as { accessToken: string }).accessToken)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
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
                <b>{u.label}</b>
                <small>{u.detail}</small>
              </button>
            ))}
          </div>
        </div>
      </form>
    </div>
  )
}
