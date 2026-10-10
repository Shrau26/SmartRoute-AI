import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Empty } from './Charts'
import { validateLinkValue } from '../lib/topology'

const FIELDS = ['bandwidth', 'latency', 'loss', 'load']

export default function WhatIfPanel({ edges, nodes, onRun, result, loading, dark, error }) {
  const [linkId, setLinkId] = useState(edges[0]?.id || '')
  const [nodeId, setNodeId] = useState('')
  const [values, setValues] = useState({})
  const [failLink, setFailLink] = useState(false)
  const [failNode, setFailNode] = useState(false)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!edges.find((e) => e.id === linkId)) setLinkId(edges[0]?.id || '')
  }, [edges, linkId])

  const edge = edges.find((e) => e.id === linkId)
  useEffect(() => {
    if (edge) setValues(Object.fromEntries(FIELDS.map((f) => [f, String(edge.data[f])])))
  }, [linkId]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = () => {
    setLocalError('')
    const changes = []
    if (edge) {
      const change = { linkId }
      for (const f of FIELDS) {
        const res = validateLinkValue(f, values[f])
        if (!res.ok) {
          setLocalError(`${f}: ${res.message}`)
          return
        }
        change[f] = res.value
      }
      if (failLink) change.status = 'down'
      changes.push(change)
    }
    if (nodeId && failNode) changes.push({ nodeId, status: 'down' })
    if (!changes.length) {
      setLocalError('Select at least one link or device to modify.')
      return
    }
    onRun(changes)
  }

  const delta = result?.delta
  const chartData = delta
    ? [
        { name: 'Eff. latency', before: result.before.metrics.effectiveLatency, after: result.after.metrics.effectiveLatency },
        { name: 'Loss %', before: result.before.metrics.packetLoss, after: result.after.metrics.packetLoss },
        { name: 'Congestion %', before: result.before.metrics.congestion, after: result.after.metrics.congestion },
        { name: 'Health', before: result.before.metrics.health, after: result.after.metrics.health },
      ]
    : []

  return (
    <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
      <div className="space-y-2">
        <div>
          <label className="lbl">Link under test</label>
          <select className="field" value={linkId} onChange={(e) => setLinkId(e.target.value)}>
            <option value="">— none —</option>
            {edges.map((e) => (
              <option key={e.id} value={e.id}>{e.id} ({e.source}↔{e.target})</option>
            ))}
          </select>
        </div>
        {edge && (
          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map((f) => (
              <div key={f}>
                <label className="lbl">{f}</label>
                <input
                  type="number"
                  className="field"
                  value={values[f] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
                />
                <div className="mt-0.5 text-[10px] text-slate-400">now: {edge.data[f]}</div>
              </div>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={failLink} onChange={(e) => setFailLink(e.target.checked)} className="accent-crit" />
          Simulate failure of this link
        </label>
        <div>
          <label className="lbl">Device failure</label>
          <select className="field" value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
            <option value="">— none —</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>{n.data.label}</option>
            ))}
          </select>
        </div>
        {nodeId && (
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={failNode} onChange={(e) => setFailNode(e.target.checked)} className="accent-crit" />
            Take {nodeId} offline in the scenario
          </label>
        )}
        <button className="btn btn-primary w-full" onClick={run} disabled={loading}>
          {loading ? 'Simulating…' : 'Run what-if scenario'}
        </button>
        {(localError || error) && <p className="text-[11px] text-crit">{localError || error}</p>}
        <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
          The scenario runs on a copy of the topology; the live network is never modified.
        </p>
      </div>

      <div className="space-y-3">
        {!result ? (
          <Empty text="Change a parameter and run the scenario to compare before vs after." />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {['before', 'after'].map((k) => (
                <div key={k} className="panel p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">{k}</div>
                  {result[k].found ? (
                    <>
                      <div className="num text-xs text-signal">{result[k].path.nodes.join(' → ')}</div>
                      <div className="num mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                        <span>Latency</span><span>{result[k].metrics.effectiveLatency} ms</span>
                        <span>Loss</span><span>{result[k].metrics.packetLoss}%</span>
                        <span>Bandwidth</span><span>{result[k].metrics.throughput} Mbps</span>
                        <span>Hops</span><span>{result[k].metrics.hopCount}</span>
                        <span>Health</span><span className="font-semibold">{result[k].metrics.health}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-crit">No route available in this scenario.</p>
                  )}
                </div>
              ))}
            </div>

            {delta && (
              <div className="panel p-3">
                <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-slate-500">Delta</div>
                <div className="num grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
                  {Object.entries(delta).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="font-sans text-slate-500">{k}</span>
                      <span className={v === 0 ? '' : (k === 'health' || k === 'throughput' ? v > 0 : v < 0) ? 'text-good' : 'text-crit'}>
                        {v > 0 ? '+' : ''}{v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {chartData.length > 0 && (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke={dark ? '#1e2c3c' : '#e2e8f0'} strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ stroke: dark ? '#64748b' : '#94a3b8', fontSize: 10 }} />
                  <YAxis tick={{ stroke: dark ? '#64748b' : '#94a3b8', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: dark ? '#16212e' : '#fff', border: `1px solid ${dark ? '#2b3d52' : '#cbd5e1'}`, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="before" fill="#7c8ea3" isAnimationActive={false} />
                  <Bar dataKey="after" fill="#1aa5bd" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </>
        )}
      </div>
    </div>
  )
}
