import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Empty } from './Charts'

export default function AIPanel({ model, onRetrain, loading, dark, error }) {
  const [samples, setSamples] = useState(12000)

  if (!model) return <Empty text={error || 'Loading model metadata…'} />

  const clf = model.classifier
  const reg = model.regressor
  const imp = clf.featureImportance.map((f) => ({ name: f.feature, importance: f.importance }))
  const [[tn, fp], [fn, tp]] = clf.confusionMatrix

  const stats = [
    ['Accuracy', clf.accuracy],
    ['Precision', clf.precision],
    ['Recall', clf.recall],
    ['F1', clf.f1],
    ['ROC-AUC', clf.rocAuc],
    ['Latency R²', reg.r2],
    ['Latency MAE', `${reg.mae} ms`],
    ['Train / test', `${model.trainedOn} / ${model.testedOn}`],
  ]

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map(([k, v]) => (
            <div key={k} className="panel px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">{k}</div>
              <div className="num mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">{v}</div>
            </div>
          ))}
        </div>

        <div className="panel p-3">
          <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-slate-500">
            Congestion classifier — feature importance
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={imp} layout="vertical" margin={{ top: 4, right: 12, left: 24, bottom: 0 }}>
              <CartesianGrid stroke={dark ? '#1e2c3c' : '#e2e8f0'} strokeDasharray="3 3" />
              <XAxis type="number" tick={{ stroke: dark ? '#64748b' : '#94a3b8', fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={80} tick={{ stroke: dark ? '#64748b' : '#94a3b8', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: dark ? '#16212e' : '#fff', border: `1px solid ${dark ? '#2b3d52' : '#cbd5e1'}`, fontSize: 11 }} />
              <Bar dataKey="importance" fill="#1aa5bd" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-3">
        <div className="panel p-3">
          <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-slate-500">Confusion matrix (test set)</div>
          <table className="num w-full text-center text-[11px]">
            <thead className="text-slate-500">
              <tr><th></th><th className="font-medium">pred clear</th><th className="font-medium">pred congested</th></tr>
            </thead>
            <tbody>
              <tr><td className="text-left text-slate-500">actual clear</td><td className="py-1 text-good">{tn}</td><td>{fp}</td></tr>
              <tr><td className="text-left text-slate-500">actual congested</td><td>{fn}</td><td className="text-good">{tp}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="panel space-y-2 p-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Retrain</div>
          <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
            Regenerates the local telemetry dataset ({model.datasetRows} rows, {Math.round(model.congestedShare * 100)}%
            congested) and refits both Random Forests on {model.features.length} features.
          </p>
          <div>
            <label className="lbl">Samples</label>
            <input
              type="number"
              className="field"
              min="2000"
              max="60000"
              step="1000"
              value={samples}
              onChange={(e) => setSamples(e.target.value)}
            />
          </div>
          <button className="btn btn-primary w-full" onClick={() => onRetrain(Number(samples))} disabled={loading}>
            {loading ? 'Training…' : 'Retrain models'}
          </button>
          {error && <p className="text-[11px] text-crit">{error}</p>}
        </div>
      </div>
    </div>
  )
}
