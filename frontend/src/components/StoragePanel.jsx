import { useState } from 'react'

export default function StoragePanel({
  saved, history, onSave, onLoad, onDelete, onRefresh, onClearHistory, error, loading,
}) {
  const [name, setName] = useState('')
  const [localError, setLocalError] = useState('')

  const save = () => {
    if (!name.trim()) {
      setLocalError('Enter a name for the topology.')
      return
    }
    setLocalError('')
    onSave(name.trim())
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="space-y-2">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="lbl">Topology name</label>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="campus-core-v1"
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </div>
          <button className="btn btn-primary" onClick={save} disabled={loading}>Save</button>
          <button className="btn" onClick={onRefresh}>Refresh</button>
        </div>
        {(localError || error) && <p className="text-[11px] text-crit">{localError || error}</p>}

        <div className="panel">
          <div className="panel-head"><span>Saved topologies</span><span className="num text-[10px] normal-case">{saved.length}</span></div>
          <div className="max-h-56 divide-y divide-slate-100 overflow-auto dark:divide-ink-600">
            {saved.length === 0 && <p className="p-3 text-xs text-slate-500 dark:text-slate-400">Nothing saved yet.</p>}
            {saved.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-100">{t.name}</div>
                  <div className="num text-[10px] text-slate-500">{t.updated_at}</div>
                </div>
                <div className="flex gap-1">
                  <button className="btn !py-0.5 !text-[10px]" onClick={() => onLoad(t.id)}>Load</button>
                  <button className="btn btn-danger !py-0.5 !text-[10px]" onClick={() => onDelete(t.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span>Simulation history</span>
          <button className="btn !py-0.5 !text-[10px] normal-case tracking-normal" onClick={onClearHistory}>Clear</button>
        </div>
        <div className="max-h-[310px] divide-y divide-slate-100 overflow-auto dark:divide-ink-600">
          {history.length === 0 && <p className="p-3 text-xs text-slate-500 dark:text-slate-400">No recorded runs yet — use “Send packet” to record one.</p>}
          {history.map((h) => (
            <div key={h.id} className="px-3 py-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700 dark:text-slate-200">{h.algorithm}</span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${h.event === 'reroute' ? 'bg-warn/15 text-warn' : 'bg-slate-100 text-slate-500 dark:bg-ink-700'}`}>
                  {h.event}
                </span>
              </div>
              <div className="num text-signal">{h.path.nodes.join(' → ')}</div>
              <div className="num text-[10px] text-slate-500">
                {h.metrics.effectiveLatency} ms · loss {h.metrics.packetLoss}% · health {h.metrics.health} · {h.createdAt}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
