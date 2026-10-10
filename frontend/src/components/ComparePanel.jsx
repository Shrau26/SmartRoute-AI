import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Empty } from './Charts'

export default function ComparePanel({ data, loading, onRun, onApply, dark }) {
  const rows = data?.results || []
  const chartData = rows
    .filter((r) => r.found)
    .map((r) => ({
      name: r.algorithm.replace('_', ' '),
      latency: r.metrics.effectiveLatency,
      health: r.metrics.health,
      best: r.algorithm === data.best,
    }))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={onRun} disabled={loading}>
          {loading ? 'Comparing…' : 'Run algorithm comparison'}
        </button>
        {data?.best && (
          <span className="text-xs text-slate-600 dark:text-slate-300">
            Best by health score: <span className="font-semibold text-good">{data.best}</span>
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty text="Compare Dijkstra, Bellman-Ford, load-aware and AI routing on the current network." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-slate-500 dark:text-slate-400">
                <tr className="text-left">
                  {['Algorithm', 'Path', 'Hops', 'Latency', 'Eff. latency', 'Loss', 'Bandwidth', 'Congestion', 'Health', ''].map((h) => (
                    <th key={h} className="py-1 pr-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="num">
                {rows.map((r) => (
                  <tr
                    key={r.algorithm}
                    className={`border-t border-slate-100 dark:border-ink-600 ${
                      r.algorithm === data.best ? 'bg-good/10' : ''
                    }`}
                  >
                    <td className="py-1.5 pr-3 font-sans">{r.label}</td>
                    {r.found ? (
                      <>
                        <td className="pr-3">{r.path.nodes.join('→')}</td>
                        <td className="pr-3">{r.metrics.hopCount}</td>
                        <td className="pr-3">{r.metrics.latency}</td>
                        <td className="pr-3">{r.metrics.effectiveLatency}</td>
                        <td className="pr-3">{r.metrics.packetLoss}%</td>
                        <td className="pr-3">{r.metrics.throughput}</td>
                        <td className="pr-3">{r.metrics.congestion}%</td>
                        <td className="pr-3 font-semibold">{r.metrics.health}</td>
                        <td>
                          <button className="btn !py-0.5 !text-[10px]" onClick={() => onApply(r.algorithm)}>
                            Use
                          </button>
                        </td>
                      </>
                    ) : (
                      <td colSpan={9} className="pr-3 font-sans text-crit">No route available</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid stroke={dark ? '#1e2c3c' : '#e2e8f0'} strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ stroke: dark ? '#64748b' : '#94a3b8', fontSize: 10 }} />
              <YAxis tick={{ stroke: dark ? '#64748b' : '#94a3b8', fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  background: dark ? '#16212e' : '#fff',
                  border: `1px solid ${dark ? '#2b3d52' : '#cbd5e1'}`,
                  fontSize: 11,
                }}
              />
              <Bar dataKey="latency" name="Eff. latency (ms)" isAnimationActive={false}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.best ? '#2f9e6b' : '#1aa5bd'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
