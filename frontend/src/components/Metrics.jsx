export function HealthCards({ result }) {
  const m = result?.metrics
  const cards = [
    { label: 'Health score', value: m ? m.health : '—', unit: '/100', tone: score(m?.health) },
    { label: 'Effective latency', value: m ? m.effectiveLatency : '—', unit: 'ms', tone: inv(m?.effectiveLatency, 40, 90) },
    { label: 'Packet loss', value: m ? m.packetLoss : '—', unit: '%', tone: inv(m?.packetLoss, 1, 4) },
    { label: 'Available bandwidth', value: m ? m.throughput : '—', unit: 'Mbps', tone: 'neutral' },
    { label: 'Hops', value: m ? m.hopCount : '—', unit: '', tone: 'neutral' },
    { label: 'Congestion', value: m ? m.congestion : '—', unit: '%', tone: inv(m?.congestion, 40, 70) },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="panel px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
            {c.label}
          </div>
          <div className={`num mt-1 text-lg font-semibold ${toneClass(c.tone)}`}>
            {c.value}
            <span className="ml-1 text-[10px] font-normal text-slate-400">{c.unit}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function score(v) {
  if (v == null) return 'neutral'
  return v >= 70 ? 'good' : v >= 45 ? 'warn' : 'crit'
}
function inv(v, warnAt, critAt) {
  if (v == null) return 'neutral'
  return v >= critAt ? 'crit' : v >= warnAt ? 'warn' : 'good'
}
function toneClass(t) {
  return t === 'good'
    ? 'text-good'
    : t === 'warn'
      ? 'text-warn'
      : t === 'crit'
        ? 'text-crit'
        : 'text-slate-800 dark:text-slate-100'
}

export function AlertsPanel({ alerts = [], error }) {
  const items = error ? [{ level: 'critical', message: error }, ...alerts] : alerts
  return (
    <div className="panel flex h-full flex-col">
      <div className="panel-head">
        <span>Alerts</span>
        <span className="num text-[10px] normal-case tracking-normal">{items.length}</span>
      </div>
      <div className="flex-1 space-y-1.5 overflow-auto p-2">
        {items.length === 0 && (
          <p className="px-1 py-3 text-xs text-slate-500 dark:text-slate-400">
            No active alerts — network is operating within thresholds.
          </p>
        )}
        {items.map((a, i) => (
          <div
            key={i}
            className={`rounded border-l-[3px] px-2 py-1.5 text-[11px] leading-snug ${
              a.level === 'critical'
                ? 'border-crit bg-crit/10 text-crit'
                : a.level === 'warning'
                  ? 'border-warn bg-warn/10 text-warn'
                  : 'border-signal bg-signal/10 text-signal'
            }`}
          >
            {a.message}
          </div>
        ))}
      </div>
    </div>
  )
}

export function PathSummary({ result }) {
  if (!result?.found) return null
  const { path, metrics, algorithmLabel, alternatives = [] } = result
  return (
    <div className="panel">
      <div className="panel-head">
        <span>Active route</span>
        <span className="text-[10px] normal-case tracking-normal text-slate-500">{algorithmLabel}</span>
      </div>
      <div className="space-y-2 p-3">
        <div className="num flex flex-wrap items-center gap-1 text-xs">
          {path.nodes.map((n, i) => (
            <span key={n} className="flex items-center gap-1">
              <span className="rounded border border-signal/50 bg-signal/10 px-1.5 py-0.5 text-signal">{n}</span>
              {i < path.nodes.length - 1 && <span className="text-slate-400">→</span>}
            </span>
          ))}
        </div>
        <table className="w-full text-[11px]">
          <thead className="text-slate-500 dark:text-slate-400">
            <tr className="text-left">
              <th className="py-1 font-medium">Hop</th>
              <th className="font-medium">Latency</th>
              <th className="font-medium">Eff.</th>
              <th className="font-medium">Loss</th>
              <th className="font-medium">Load</th>
              <th className="font-medium">Risk</th>
            </tr>
          </thead>
          <tbody className="num">
            {metrics.hops.map((h) => (
              <tr key={h.link} className="border-t border-slate-100 dark:border-ink-600">
                <td className="py-1">{h.source}→{h.target}</td>
                <td>{h.latency}</td>
                <td>{h.effectiveLatency}</td>
                <td>{h.loss}%</td>
                <td>{h.load}%</td>
                <td className={h.congestionRisk >= 0.7 ? 'text-crit' : h.congestionRisk >= 0.4 ? 'text-warn' : ''}>
                  {h.congestionRisk == null ? '—' : `${Math.round(h.congestionRisk * 100)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {alternatives.length > 0 && (
          <div className="border-t border-slate-100 pt-2 text-[11px] dark:border-ink-600">
            <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-slate-500">Backup routes</div>
            {alternatives.map((a, i) => (
              <div key={i} className="num flex justify-between text-slate-600 dark:text-slate-300">
                <span>{a.path.nodes.join(' → ')}</span>
                <span>{a.metrics.effectiveLatency} ms · health {a.metrics.health}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
