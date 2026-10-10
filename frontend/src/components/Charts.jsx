import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const axis = (dark) => ({ stroke: dark ? '#64748b' : '#94a3b8', fontSize: 10 })

function tooltipStyle(dark) {
  return {
    contentStyle: {
      background: dark ? '#16212e' : '#ffffff',
      border: `1px solid ${dark ? '#2b3d52' : '#cbd5e1'}`,
      borderRadius: 4,
      fontSize: 11,
    },
    labelStyle: { color: dark ? '#dbe5ef' : '#334155', fontSize: 11 },
  }
}

export function LiveMetricsChart({ series, dark }) {
  if (!series.length) {
    return <Empty text="Run a simulation to start recording metrics." />
  }
  return (
    <ResponsiveContainer width="100%" height={190}>
      <LineChart data={series} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid stroke={dark ? '#1e2c3c' : '#e2e8f0'} strokeDasharray="3 3" />
        <XAxis dataKey="t" tick={axis(dark)} />
        <YAxis tick={axis(dark)} />
        <Tooltip {...tooltipStyle(dark)} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Line type="monotone" dataKey="latency" name="Eff. latency (ms)" stroke="#1aa5bd" dot={false} strokeWidth={2} isAnimationActive={false} />
        <Line type="monotone" dataKey="congestion" name="Congestion (%)" stroke="#d38b12" dot={false} strokeWidth={2} isAnimationActive={false} />
        <Line type="monotone" dataKey="loss" name="Loss (%)" stroke="#d8453f" dot={false} strokeWidth={2} isAnimationActive={false} />
        <Line type="monotone" dataKey="health" name="Health" stroke="#2f9e6b" dot={false} strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function HopLatencyChart({ result, dark }) {
  if (!result?.found) return <Empty text="No active route." />
  const data = result.metrics.hops.map((h) => ({
    name: `${h.source}→${h.target}`,
    base: h.latency,
    effective: Number((h.effectiveLatency - h.latency).toFixed(2)),
  }))
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid stroke={dark ? '#1e2c3c' : '#e2e8f0'} strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={axis(dark)} />
        <YAxis tick={axis(dark)} />
        <Tooltip {...tooltipStyle(dark)} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar dataKey="base" name="Base latency (ms)" stackId="a" fill="#1aa5bd" isAnimationActive={false} />
        <Bar dataKey="effective" name="Queueing delay (ms)" stackId="a" fill="#d38b12" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function LinkLoadChart({ edges, predictions, dark }) {
  const data = edges.map((e) => ({
    name: e.id,
    load: Number(e.data.load),
    risk: predictions?.[e.id] ? Math.round(predictions[e.id].congestion_probability * 100) : 0,
  }))
  if (!data.length) return <Empty text="No links in the topology." />
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid stroke={dark ? '#1e2c3c' : '#e2e8f0'} strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={axis(dark)} />
        <YAxis tick={axis(dark)} domain={[0, 100]} />
        <Tooltip {...tooltipStyle(dark)} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar dataKey="load" name="Utilisation (%)" fill="#7c8ea3" isAnimationActive={false} />
        <Bar dataKey="risk" name="Congestion risk (%)" isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.risk >= 70 ? '#d8453f' : d.risk >= 40 ? '#d38b12' : '#2f9e6b'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function Empty({ text }) {
  return (
    <div className="flex h-[190px] items-center justify-center text-xs text-slate-500 dark:text-slate-400">
      {text}
    </div>
  )
}
