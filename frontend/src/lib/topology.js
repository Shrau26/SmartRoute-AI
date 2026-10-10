export const LINK_DEFAULTS = {
  bandwidth: 100,
  latency: 5,
  loss: 0.2,
  cost: 10,
  load: 25,
  flows: 10,
  status: 'up',
}

let seq = { router: 0, pc: 0, link: 0 }

export function resetSequence(nodes = [], edges = []) {
  const max = (prefix, list, key) =>
    list.reduce((acc, item) => {
      const m = String(item[key] ?? item.id).match(new RegExp(`^${prefix}(\\d+)$`))
      return m ? Math.max(acc, Number(m[1])) : acc
    }, 0)
  seq = {
    router: max('R', nodes.filter((n) => n.data.kind === 'router'), 'id'),
    pc: max('PC', nodes.filter((n) => n.data.kind === 'pc'), 'id'),
    link: max('L', edges, 'id'),
  }
}

export function nextId(kind) {
  if (kind === 'router') return `R${++seq.router}`
  if (kind === 'pc') return `PC${++seq.pc}`
  return `L${++seq.link}`
}

export function makeNode(kind, position) {
  const id = nextId(kind)
  return {
    id,
    type: 'device',
    position,
    data: { label: id, kind, status: 'up' },
  }
}

export function makeEdge(source, target, overrides = {}) {
  return {
    id: nextId('link'),
    source,
    target,
    type: 'netlink',
    data: { ...LINK_DEFAULTS, ...overrides },
  }
}

/** React Flow graph -> backend topology payload */
export function toTopology(nodes, edges) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.kind,
      label: n.data.label,
      status: n.data.status,
    })),
    links: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      bandwidth: e.data.bandwidth,
      latency: e.data.latency,
      loss: e.data.loss,
      cost: e.data.cost,
      load: e.data.load,
      flows: e.data.flows,
      status: e.data.status,
    })),
  }
}

/** backend topology + saved layout -> React Flow graph */
export function fromTopology(topology, layout = {}) {
  const nodes = topology.nodes.map((n, i) => ({
    id: n.id,
    type: 'device',
    position: layout[n.id] || { x: 120 + (i % 4) * 190, y: 90 + Math.floor(i / 4) * 150 },
    data: { label: n.label || n.id, kind: n.type === 'pc' ? 'pc' : 'router', status: n.status || 'up' },
  }))
  const edges = topology.links.map((l) => ({
    id: l.id,
    source: l.source,
    target: l.target,
    type: 'netlink',
    data: {
      bandwidth: l.bandwidth,
      latency: l.latency,
      loss: l.loss,
      cost: l.cost,
      load: l.load,
      flows: l.flows ?? 10,
      status: l.status || 'up',
    },
  }))
  resetSequence(nodes, edges)
  return { nodes, edges }
}

/** Sample enterprise-style network used on first load. */
export function defaultGraph() {
  const topology = {
    nodes: [
      { id: 'PC1', type: 'pc', label: 'PC1', status: 'up' },
      { id: 'R1', type: 'router', label: 'R1', status: 'up' },
      { id: 'R2', type: 'router', label: 'R2', status: 'up' },
      { id: 'R3', type: 'router', label: 'R3', status: 'up' },
      { id: 'R4', type: 'router', label: 'R4', status: 'up' },
      { id: 'R5', type: 'router', label: 'R5', status: 'up' },
      { id: 'PC2', type: 'pc', label: 'PC2', status: 'up' },
    ],
    links: [
      { id: 'L1', source: 'PC1', target: 'R1', bandwidth: 1000, latency: 1, loss: 0, cost: 2, load: 30, flows: 12 },
      { id: 'L2', source: 'R1', target: 'R2', bandwidth: 100, latency: 6, loss: 0.4, cost: 8, load: 88, flows: 120 },
      { id: 'L3', source: 'R1', target: 'R3', bandwidth: 200, latency: 11, loss: 0.1, cost: 12, load: 22, flows: 18 },
      { id: 'L4', source: 'R2', target: 'R4', bandwidth: 100, latency: 5, loss: 1.2, cost: 7, load: 82, flows: 95 },
      { id: 'L5', source: 'R3', target: 'R4', bandwidth: 500, latency: 8, loss: 0.1, cost: 9, load: 18, flows: 22 },
      { id: 'L6', source: 'R3', target: 'R5', bandwidth: 200, latency: 14, loss: 0.3, cost: 14, load: 35, flows: 30 },
      { id: 'L7', source: 'R5', target: 'R4', bandwidth: 200, latency: 7, loss: 0.2, cost: 11, load: 28, flows: 25 },
      { id: 'L8', source: 'R4', target: 'PC2', bandwidth: 1000, latency: 1, loss: 0, cost: 2, load: 26, flows: 15 },
    ],
  }
  const layout = {
    PC1: { x: 40, y: 220 },
    R1: { x: 210, y: 220 },
    R2: { x: 390, y: 90 },
    R3: { x: 390, y: 350 },
    R4: { x: 610, y: 220 },
    R5: { x: 560, y: 400 },
    PC2: { x: 790, y: 220 },
  }
  return fromTopology(topology, layout)
}

export function validateLinkValue(field, value) {
  const ranges = {
    bandwidth: [1, 10000],
    latency: [0.1, 5000],
    loss: [0, 100],
    cost: [0.1, 10000],
    load: [0, 100],
    flows: [0, 1000],
  }
  const [lo, hi] = ranges[field] || [0, Infinity]
  const n = Number(value)
  if (value === '' || Number.isNaN(n)) return { ok: false, message: 'Enter a number' }
  if (n < lo || n > hi) return { ok: false, message: `Allowed range ${lo} – ${hi}` }
  return { ok: true, value: n }
}
