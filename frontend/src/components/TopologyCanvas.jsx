import { memo, useCallback, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  addEdge,
  getBezierPath,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { makeEdge } from '../lib/topology'

/* ----------------------------- device node ----------------------------- */
const DeviceNode = memo(({ data, selected }) => {
  const down = data.status === 'down'
  const pc = data.kind === 'pc'
  const onPath = data.onPath
  const border = down
    ? 'border-crit'
    : onPath
      ? 'border-signal'
      : 'border-slate-300 dark:border-ink-500'

  return (
    <div
      className={`min-w-[86px] rounded border-2 bg-white px-2.5 py-1.5 text-center shadow-sm
        dark:bg-ink-700 ${border} ${selected ? 'ring-2 ring-signal/50' : ''}
        ${down ? 'opacity-60' : ''}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center justify-center gap-1.5">
        <span className={`inline-block h-2 w-2 rounded-full ${down ? 'bg-crit' : 'bg-good'}`} />
        <span className="font-mono text-[13px] font-semibold text-slate-800 dark:text-slate-100">
          {data.label}
        </span>
      </div>
      <div className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {pc ? 'host' : 'router'}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
})
DeviceNode.displayName = 'DeviceNode'

/* ------------------------------ link edge ------------------------------ */
function riskColor(risk, down) {
  if (down) return '#d8453f'
  if (risk == null) return '#94a3b8'
  if (risk >= 0.7) return '#d8453f'
  if (risk >= 0.4) return '#d38b12'
  return '#7c8ea3'
}

const NetLinkEdge = memo((props) => {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props
  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  })
  const down = data.status === 'down'
  const anim = data.anim
  const onPath = data.onPath
  const color = anim || onPath ? '#1aa5bd' : riskColor(data.risk, down)
  const width = anim || onPath ? 3.5 : selected ? 3 : 2

  return (
    <>
      <path
        id={id}
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={down ? '6 5' : undefined}
        className="rf-link"
      />
      <path d={path} fill="none" stroke="transparent" strokeWidth={18} />
      {anim && (
        <circle key={anim.runId} r="5.5" fill="#1aa5bd" stroke="#ffffff" strokeWidth="1.5">
          <animateMotion
            dur={`${anim.duration}s`}
            begin={`${anim.delay}s`}
            repeatCount={anim.repeat}
            fill="freeze"
            keyPoints={anim.reversed ? '1;0' : '0;1'}
            keyTimes="0;1"
            calcMode="linear"
            path={path}
          />
        </circle>
      )}
      <g transform={`translate(${labelX} ${labelY})`} pointerEvents="none">
        <rect x={-34} y={-11} width={68} height={22} rx={3}
          className="fill-white/90 dark:fill-ink-800/90" stroke={color} strokeWidth={0.8} />
        <text textAnchor="middle" y={-1} className="fill-slate-700 dark:fill-slate-200"
          style={{ fontSize: 9, fontFamily: 'ui-monospace, monospace' }}>
          {data.latency}ms · {data.bandwidth}M
        </text>
        <text textAnchor="middle" y={8} style={{ fontSize: 8.5, fontFamily: 'ui-monospace, monospace' }}
          fill={riskColor(data.risk, down)}>
          {down ? 'DOWN' : `ld ${Math.round(data.load)}% · ls ${data.loss}%`}
        </text>
      </g>
    </>
  )
})
NetLinkEdge.displayName = 'NetLinkEdge'

const nodeTypes = { device: DeviceNode }
const edgeTypes = { netlink: NetLinkEdge }

/* ------------------------------- canvas -------------------------------- */
export default function TopologyCanvas({
  nodes, edges, onNodesChange, onEdgesChange, setEdges,
  onSelect, dark,
}) {
  const onConnect = useCallback(
    (params) => {
      if (params.source === params.target) return
      setEdges((eds) => {
        const dup = eds.some(
          (e) =>
            (e.source === params.source && e.target === params.target) ||
            (e.source === params.target && e.target === params.source),
        )
        if (dup) return eds
        return addEdge(makeEdge(params.source, params.target), eds)
      })
    },
    [setEdges],
  )

  const handleSelection = useCallback(
    ({ nodes: sn, edges: se }) => {
      if (sn.length) onSelect({ kind: 'node', id: sn[0].id })
      else if (se.length) onSelect({ kind: 'edge', id: se[0].id })
      else onSelect(null)
    },
    [onSelect],
  )

  const minimapColor = useMemo(
    () => (n) => (n.data.status === 'down' ? '#d8453f' : n.data.kind === 'pc' ? '#2f9e6b' : '#1aa5bd'),
    [],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onSelectionChange={handleSelection}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ type: 'netlink' }}
      className="bg-slate-50 dark:bg-ink-900"
    >
      <Background color={dark ? '#1e2c3c' : '#cbd5e1'} gap={18} size={1} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={minimapColor}
        maskColor={dark ? 'rgba(10,16,23,0.7)' : 'rgba(241,245,249,0.7)'}
        className="!bg-white dark:!bg-ink-800"
      />
    </ReactFlow>
  )
}
