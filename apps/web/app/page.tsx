const ENGINES = [
  { name: 'Numbering', state: 'implemented', note: 'Gapless, locking UPDATE in the caller transaction' },
  { name: 'Fiscal period guard', state: 'implemented', note: 'No bypass path exists' },
  { name: 'Costing', state: 'implemented', note: 'Moving weighted average, zero-residue on cycle to empty' },
  { name: 'Outbox', state: 'implemented', note: 'SKIP LOCKED claim, backoff, dead-letter' },
  { name: 'Stock ledger', state: 'schema only', note: 'Append-only, trigger-enforced' },
  { name: 'GL posting', state: 'schema only', note: 'Reversal-only' },
  { name: 'Document', state: 'not started', note: 'Phase 1' },
  { name: 'Workflow & approval', state: 'not started', note: 'Phase 1' },
  { name: 'UoM', state: 'schema only', note: 'Dual quantity captured, never derived' },
  { name: 'Audit', state: 'schema only', note: 'Changed fields only' },
]

const COLOR: Record<string, string> = {
  implemented: '#0b6f70',
  'schema only': '#7d5c0d',
  'not started': '#66797f',
}

export default function Page() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 20px' }}>
      <p style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: '#0b6f70', margin: 0 }}>
        Phase 0 · Foundation
      </p>
      <h1 style={{ fontSize: 34, margin: '10px 0 6px', color: '#101f2c' }}>PRODX Manufacturing ERP</h1>
      <p style={{ color: '#3a4d58', margin: '0 0 32px' }}>
        Engines before modules. 151 modules map onto 13 behaviour families, so the
        build is shared engines with the modules configured on top.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {ENGINES.map((engine) => (
          <li
            key={engine.name}
            style={{
              background: '#fff', border: '1px solid #d3dddf', borderLeft: `4px solid ${COLOR[engine.state]}`,
              padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 4,
            }}
          >
            <strong style={{ color: '#101f2c' }}>{engine.name}</strong>
            <span style={{ fontSize: 11, color: COLOR[engine.state], textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {engine.state}
            </span>
            <span style={{ gridColumn: '1 / -1', fontSize: 13, color: '#66797f' }}>{engine.note}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
