import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEdgesState, useNodesState } from 'reactflow'
import TopologyCanvas from './components/TopologyCanvas'
import Inspector from './components/Inspector'
import { AlertsPanel, HealthCards, PathSummary } from './components/Metrics'
import { HopLatencyChart, LinkLoadChart, LiveMetricsChart } from './components/Charts'
import ComparePanel from './components/ComparePanel'
import WhatIfPanel from './components/WhatIfPanel'
import AIPanel from './components/AIPanel'
import StoragePanel from './components/StoragePanel'
import { api } from './lib/api'
import { defaultGraph, fromTopology, makeNode, toTopology } from './lib/topology'

const HOP_SECONDS = 0.8
const TABS = [
  ['metrics', 'Live metrics'],
  ['compare', 'Algorithm comparison'],
  ['whatif', 'What-if simulator'],
  ['ai', 'AI model'],
  ['storage', 'Save / history'],
]

export default function App() {
  const initial = useMemo(() => defaultGraph(), [])
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)

  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('sr-theme') !== 'light'
    } catch {
      return true
    }
  })
  const [selection, setSelection] = useState(null)
  const [source, setSource] = useState('PC1')
  const [target, setTarget] = useState('PC2')
  const [algorithm, setAlgorithm] = useState('ai')
  const [algorithms, setAlgorithms] = useState([])

  const [result, setResult] = useState(null)
  const [routeError, setRouteError] = useState('')
  const [busy, setBusy] = useState(false)
  const [backendUp, setBackendUp] = useState(null)

  const [series, setSeries] = useState([])
  const [packet, setPacket] = useState(null)
  const [live, setLive] = useState(false)

  const [tab, setTab] = useState('metrics')
  const [compare, setCompare] = useState(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [whatIf, setWhatIf] = useState(null)
  const [whatIfLoading, setWhatIfLoading] = useState(false)
  const [whatIfError, setWhatIfError] = useState('')
  const [model, setModel] = useState(null)
  const [modelLoading, setModelLoading] = useState(false)
  const [modelError, setModelError] = useState('')
  const [saved, setSaved] = useState([])
  const [history, setHistory] = useState([])
  const [storageError, setStorageError] = useState('')

  const prevPath = useRef(null)
  const tick = useRef(0)

  /* ------------------------------- theme ------------------------------- */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem('sr-theme', dark ? 'dark' : 'light')
    } catch { /* storage unavailable */ }
  }, [dark])

  /* ---------------------------- initial load --------------------------- */
  useEffect(() => {
    api.health().then(() => setBackendUp(true)).catch(() => setBackendUp(false))
    api.algorithms().then(setAlgorithms).catch(() => {})
    refreshModel()
    refreshSaved()
    refreshHistory()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshModel = () => api.model().then(setModel).catch((e) => setModelError(e.message))
  const refreshSaved = () => api.listTopologies().then(setSaved).catch((e) => setStorageError(e.message))
  const refreshHistory = () => api.history(40).then(setHistory).catch(() => {})

  /* --------------------------- route computing -------------------------- */
  const topology = useMemo(() => toTopology(nodes, edges), [nodes, edges])
  const topoKey = useMemo(() => JSON.stringify(topology), [topology])

  const computeRoute = useCallback(
    async ({ record = false } = {}) => {
      if (!source || !target) {
        setResult(null)
        setRouteError('Select a source and a destination.')
        return null
      }
      setBusy(true)
      try {
        const data = await api.route({
          topology: JSON.parse(topoKey),
          source,
          target,
          algorithm,
          record,
          previousPath: prevPath.current ? { nodes: prevPath.current } : null,
        })
        setResult(data)
        setRouteError('')
        setBackendUp(true)
        if (data.found) {
          prevPath.current = data.path.nodes
          tick.current += 1
          setSeries((s) =>
            [...s, {
              t: tick.current,
              latency: data.metrics.effectiveLatency,
              congestion: data.metrics.congestion,
              loss: data.metrics.packetLoss,
              health: data.metrics.health,
            }].slice(-40),
          )
          if (data.rerouted || record) refreshHistory()
        } else {
          prevPath.current = null
        }
        return data
      } catch (e) {
        setResult(null)
        setRouteError(e.message)
        if (e.message.includes('backend')) setBackendUp(false)
        return null
      } finally {
        setBusy(false)
      }
    },
    [topoKey, source, target, algorithm],
  )

  useEffect(() => {
    const id = setTimeout(() => computeRoute(), 220)
    return () => clearTimeout(id)
  }, [computeRoute])

  /* ------------------------- live traffic engine ------------------------ */
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => {
      setEdges((eds) =>
        eds.map((e) => {
          const delta = (Math.random() - 0.45) * 22
          const load = Math.min(100, Math.max(0, Number(e.data.load) + delta))
          return { ...e, data: { ...e.data, load: Math.round(load * 10) / 10 } }
        }),
      )
    }, 2600)
    return () => clearInterval(id)
  }, [live, setEdges])

  /* ---------------------------- packet sending -------------------------- */
  const sendPacket = async () => {
    const data = await computeRoute({ record: true })
    if (!data?.found) return
    const runId = Date.now()
    setPacket({ runId, links: data.path.links, nodes: data.path.nodes })
    const total = (data.path.links.length + 1) * HOP_SECONDS * 1000
    setTimeout(() => setPacket((p) => (p && p.runId === runId ? null : p)), total)
  }

  /* ----------------------------- mutations ------------------------------ */
  const addDevice = (kind) => {
    const n = makeNode(kind, {
      x: 120 + Math.random() * 520,
      y: 80 + Math.random() * 300,
    })
    setNodes((ns) => [...ns, n])
  }

  const updateNode = (id, patch) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)))

  const updateEdge = (id, patch) =>
    setEdges((es) => es.map((e) => (e.id === id ? { ...e, data: { ...e.data, ...patch } } : e)))

  const remove = (kind, id) => {
    if (kind === 'node') {
      setNodes((ns) => ns.filter((n) => n.id !== id))
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id))
      if (source === id) setSource('')
      if (target === id) setTarget('')
    } else {
      setEdges((es) => es.filter((e) => e.id !== id))
    }
    setSelection(null)
  }

  const resetTopology = () => {
    const g = defaultGraph()
    setNodes(g.nodes)
    setEdges(g.edges)
    setSource('PC1')
    setTarget('PC2')
    setSelection(null)
    setSeries([])
    prevPath.current = null
  }

  /* ------------------------------ panels -------------------------------- */
  const runCompare = async () => {
    setCompareLoading(true)
    try {
      setCompare(await api.compare({ topology, source, target }))
    } catch (e) {
      setCompare({ results: [], best: null })
      setRouteError(e.message)
    } finally {
      setCompareLoading(false)
    }
  }

  const runWhatIf = async (changes) => {
    setWhatIfLoading(true)
    setWhatIfError('')
    try {
      setWhatIf(await api.whatIf({ topology, source, target, algorithm, changes }))
    } catch (e) {
      setWhatIf(null)
      setWhatIfError(e.message)
    } finally {
      setWhatIfLoading(false)
    }
  }

  const retrain = async (samples) => {
    setModelLoading(true)
    setModelError('')
    try {
      setModel(await api.trainModel({ samples }))
      computeRoute()
    } catch (e) {
      setModelError(e.message)
    } finally {
      setModelLoading(false)
    }
  }

  const saveTopology = async (name) => {
    setStorageError('')
    try {
      const layout = Object.fromEntries(nodes.map((n) => [n.id, n.position]))
      await api.saveTopology({ name, topology, layout })
      refreshSaved()
    } catch (e) {
      setStorageError(e.message)
    }
  }

  const loadTopology = async (id) => {
    setStorageError('')
    try {
      const row = await api.getTopology(id)
      const g = fromTopology(row.data.topology, row.data.layout || {})
      setNodes(g.nodes)
      setEdges(g.edges)
      setSelection(null)
      setSeries([])
      prevPath.current = null
      const ids = g.nodes.map((n) => n.id)
      if (!ids.includes(source)) setSource(ids[0] || '')
      if (!ids.includes(target)) setTarget(ids[ids.length - 1] || '')
    } catch (e) {
      setStorageError(e.message)
    }
  }

  const deleteTopology = async (id) => {
    try {
      await api.deleteTopology(id)
      refreshSaved()
    } catch (e) {
      setStorageError(e.message)
    }
  }

  /* --------------------------- decorated graph -------------------------- */
  const pathNodeSet = useMemo(() => new Set(result?.found ? result.path.nodes : []), [result])
  const pathLinkSet = useMemo(() => new Set(result?.found ? result.path.links : []), [result])

  const displayNodes = useMemo(
    () => nodes.map((n) => ({ ...n, data: { ...n.data, onPath: pathNodeSet.has(n.id) } })),
    [nodes, pathNodeSet],
  )

  const displayEdges = useMemo(
    () =>
      edges.map((e) => {
        let anim = null
        if (packet) {
          const i = packet.links.indexOf(e.id)
          if (i >= 0) {
            anim = {
              runId: `${packet.runId}-${e.id}`,
              delay: i * HOP_SECONDS,
              duration: HOP_SECONDS,
              repeat: '1',
              reversed: packet.nodes[i] !== e.source,
            }
          }
        }
        return {
          ...e,
          data: {
            ...e.data,
            risk: result?.predictions?.[e.id]?.congestion_probability ?? null,
            onPath: pathLinkSet.has(e.id),
            anim,
          },
        }
      }),
    [edges, packet, result, pathLinkSet],
  )

  const deviceOptions = nodes.map((n) => (
    <option key={n.id} value={n.id}>{n.data.label}</option>
  ))

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* header */}
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-300 bg-white px-4 py-2 dark:border-ink-600 dark:bg-ink-800">
        <div className="mr-2">
          <h1 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
            SmartRoute AI
          </h1>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            Intelligent Network Routing Simulator
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <select className="field !w-auto" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">source…</option>
            {deviceOptions}
          </select>
          <span className="text-slate-400">→</span>
          <select className="field !w-auto" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">destination…</option>
            {deviceOptions}
          </select>
          <select className="field !w-auto" value={algorithm} onChange={(e) => setAlgorithm(e.target.value)}>
            {(algorithms.length ? algorithms : [{ id: 'ai', label: 'AI Recommended' }]).map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={sendPacket} disabled={busy || !result?.found}>
            Send packet
          </button>
          <button
            className={`btn ${live ? '!border-warn !text-warn' : ''}`}
            onClick={() => setLive((v) => !v)}
            title="Randomly vary link utilisation to trigger dynamic rerouting"
          >
            {live ? '■ Stop live traffic' : '▶ Live traffic'}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className={`num text-[10px] ${backendUp === false ? 'text-crit' : 'text-good'}`}>
            {backendUp === false ? '● backend offline' : backendUp ? '● backend online' : '○ connecting'}
          </span>
          <button className="btn" onClick={resetTopology}>Reset</button>
          <button className="btn" onClick={() => setDark((d) => !d)}>
            {dark ? '☀ Light' : '☾ Dark'}
          </button>
        </div>
      </header>

      {/* main */}
      <div className="flex min-h-0 flex-1">
        {/* left rail */}
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-300 bg-white dark:border-ink-600 dark:bg-ink-800">
          <div className="panel-head">Devices</div>
          <div className="flex gap-2 p-3">
            <button className="btn flex-1" onClick={() => addDevice('router')}>+ Router</button>
            <button className="btn flex-1" onClick={() => addDevice('pc')}>+ PC</button>
          </div>
          <div className="panel-head">Properties</div>
          <Inspector
            selection={selection}
            nodes={nodes}
            edges={edges}
            updateNode={updateNode}
            updateEdge={updateEdge}
            remove={remove}
            prediction={selection?.kind === 'edge' ? result?.predictions?.[selection.id] : null}
          />
        </aside>

        {/* canvas + bottom tabs */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-[280px] flex-1 border-b border-slate-300 dark:border-ink-600">
            <TopologyCanvas
              nodes={displayNodes}
              edges={displayEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              setEdges={setEdges}
              onSelect={setSelection}
              dark={dark}
            />
          </div>

          <section className="h-[46%] min-h-[300px] overflow-hidden bg-white dark:bg-ink-800">
            <div className="flex items-center gap-1 border-b border-slate-200 px-2 dark:border-ink-600">
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  className={`tab ${tab === id ? 'tab-active' : ''}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="h-[calc(100%-37px)] overflow-auto p-3">
              {tab === 'metrics' && (
                <div className="space-y-3">
                  <HealthCards result={result} />
                  <div className="grid gap-3 xl:grid-cols-3">
                    <div className="panel p-2">
                      <div className="mb-1 px-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                        Route metrics over time
                      </div>
                      <LiveMetricsChart series={series} dark={dark} />
                    </div>
                    <div className="panel p-2">
                      <div className="mb-1 px-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                        Per-hop latency breakdown
                      </div>
                      <HopLatencyChart result={result} dark={dark} />
                    </div>
                    <div className="panel p-2">
                      <div className="mb-1 px-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                        Link utilisation vs predicted congestion
                      </div>
                      <LinkLoadChart edges={edges} predictions={result?.predictions} dark={dark} />
                    </div>
                  </div>
                </div>
              )}
              {tab === 'compare' && (
                <ComparePanel
                  data={compare}
                  loading={compareLoading}
                  onRun={runCompare}
                  onApply={setAlgorithm}
                  dark={dark}
                />
              )}
              {tab === 'whatif' && (
                <WhatIfPanel
                  edges={edges}
                  nodes={nodes}
                  onRun={runWhatIf}
                  result={whatIf}
                  loading={whatIfLoading}
                  error={whatIfError}
                  dark={dark}
                />
              )}
              {tab === 'ai' && (
                <AIPanel
                  model={model}
                  onRetrain={retrain}
                  loading={modelLoading}
                  error={modelError}
                  dark={dark}
                />
              )}
              {tab === 'storage' && (
                <StoragePanel
                  saved={saved}
                  history={history}
                  onSave={saveTopology}
                  onLoad={loadTopology}
                  onDelete={deleteTopology}
                  onRefresh={refreshSaved}
                  onClearHistory={() => api.clearHistory().then(refreshHistory)}
                  error={storageError}
                />
              )}
            </div>
          </section>
        </main>

        {/* right rail */}
        <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-300 bg-slate-50 p-3 dark:border-ink-600 dark:bg-ink-900">
          <PathSummary result={result} />
          <div className="min-h-[180px] flex-1">
            <AlertsPanel alerts={result?.alerts || []} error={routeError} />
          </div>
        </aside>
      </div>
    </div>
  )
}
