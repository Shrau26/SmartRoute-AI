import { useEffect, useState } from 'react'
import { validateLinkValue } from '../lib/topology'

const LINK_FIELDS = [
  { key: 'bandwidth', label: 'Bandwidth (Mbps)', step: 10 },
  { key: 'latency', label: 'Latency (ms)', step: 0.5 },
  { key: 'loss', label: 'Packet loss (%)', step: 0.1 },
  { key: 'cost', label: 'Admin cost', step: 1 },
  { key: 'load', label: 'Traffic load (%)', step: 5 },
  { key: 'flows', label: 'Active flows', step: 5 },
]

export default function Inspector({ selection, nodes, edges, updateNode, updateEdge, remove, prediction }) {
  const [errors, setErrors] = useState({})
  const [draft, setDraft] = useState({})

  const node = selection?.kind === 'node' ? nodes.find((n) => n.id === selection.id) : null
  const edge = selection?.kind === 'edge' ? edges.find((e) => e.id === selection.id) : null

  useEffect(() => {
    setErrors({})
    if (edge) setDraft(Object.fromEntries(LINK_FIELDS.map((f) => [f.key, String(edge.data[f.key])])))
    else if (node) setDraft({ label: node.data.label })
  }, [selection?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!node && !edge) {
    return (
      <div className="px-3 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
        Select a device or link on the canvas to edit its properties.
        <div className="mt-2 text-[11px]">Drag from a node handle to create a link.</div>
      </div>
    )
  }

  const commitLink = (key, raw) => {
    setDraft((d) => ({ ...d, [key]: raw }))
    const res = validateLinkValue(key, raw)
    if (!res.ok) {
      setErrors((e) => ({ ...e, [key]: res.message }))
      return
    }
    setErrors((e) => {
      const n = { ...e }
      delete n[key]
      return n
    })
    updateEdge(edge.id, { [key]: res.value })
  }

  if (node) {
    return (
      <div className="space-y-3 p-3">
        <div>
          <label className="lbl">Device name</label>
          <input
            className="field"
            value={draft.label ?? ''}
            onChange={(e) => {
              const v = e.target.value
              setDraft((d) => ({ ...d, label: v }))
              if (v.trim()) updateNode(node.id, { label: v.trim().slice(0, 16) })
            }}
          />
          {!String(draft.label ?? '').trim() && (
            <p className="mt-1 text-[10px] text-crit">Name cannot be empty</p>
          )}
        </div>
        <div>
          <label className="lbl">Type</label>
          <select
            className="field"
            value={node.data.kind}
            onChange={(e) => updateNode(node.id, { kind: e.target.value })}
          >
            <option value="router">Router</option>
            <option value="pc">PC / Host</option>
          </select>
        </div>
        <div className="flex items-center justify-between rounded border border-slate-200 px-2 py-2 dark:border-ink-600">
          <span className="text-xs text-slate-600 dark:text-slate-300">Operational status</span>
          <button
            className={`btn ${node.data.status === 'down' ? 'btn-danger' : ''}`}
            onClick={() => updateNode(node.id, { status: node.data.status === 'down' ? 'up' : 'down' })}
          >
            {node.data.status === 'down' ? 'DOWN — restore' : 'UP — fail device'}
          </button>
        </div>
        <button className="btn btn-danger w-full" onClick={() => remove('node', node.id)}>
          Delete device
        </button>
      </div>
    )
  }

  const risk = prediction ? Math.round(prediction.congestion_probability * 100) : null
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="num font-semibold text-slate-800 dark:text-slate-100">{edge.id}</span>
        <span className="text-slate-500 dark:text-slate-400">
          {edge.source} ↔ {edge.target}
        </span>
      </div>

      {risk !== null && (
        <div className="rounded border border-slate-200 px-2 py-2 text-xs dark:border-ink-600">
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-300">Model congestion risk</span>
            <span className={`num font-semibold ${risk >= 70 ? 'text-crit' : risk >= 40 ? 'text-warn' : 'text-good'}`}>
              {risk}%
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Predicted hop delay</span>
            <span className="num">{prediction.predicted_latency.toFixed(2)} ms</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {LINK_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="lbl">{f.label}</label>
            <input
              type="number"
              step={f.step}
              className={`field ${errors[f.key] ? 'border-crit' : ''}`}
              value={draft[f.key] ?? ''}
              onChange={(e) => commitLink(f.key, e.target.value)}
            />
            {errors[f.key] && <p className="mt-0.5 text-[10px] text-crit">{errors[f.key]}</p>}
          </div>
        ))}
      </div>

      <div>
        <label className="lbl">Traffic load</label>
        <input
          type="range"
          min="0"
          max="100"
          value={Number(draft.load) || 0}
          onChange={(e) => commitLink('load', e.target.value)}
          className="w-full accent-signal"
        />
      </div>

      <div className="flex gap-2">
        <button
          className={`btn flex-1 ${edge.data.status === 'down' ? 'btn-danger' : ''}`}
          onClick={() => updateEdge(edge.id, { status: edge.data.status === 'down' ? 'up' : 'down' })}
        >
          {edge.data.status === 'down' ? 'Restore link' : 'Fail link'}
        </button>
        <button className="btn btn-danger flex-1" onClick={() => remove('edge', edge.id)}>
          Delete link
        </button>
      </div>
    </div>
  )
}
