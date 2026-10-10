const BASE = '/api'

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch {
    throw new Error('Cannot reach the backend on http://127.0.0.1:5000 — is Flask running?')
  }
  let data = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`)
  return data
}

const post = (p, b) => request(p, { method: 'POST', body: JSON.stringify(b) })

export const api = {
  health: () => request('/health'),
  algorithms: () => request('/algorithms'),
  route: (payload) => post('/route', payload),
  compare: (payload) => post('/compare', payload),
  whatIf: (payload) => post('/whatif', payload),
  predict: (topology) => post('/predict', { topology }),
  model: () => request('/model'),
  trainModel: (payload) => post('/model/train', payload || {}),
  listTopologies: () => request('/topologies'),
  saveTopology: (payload) => post('/topologies', payload),
  getTopology: (id) => request(`/topologies/${id}`),
  deleteTopology: (id) => request(`/topologies/${id}`, { method: 'DELETE' }),
  history: (limit = 60) => request(`/history?limit=${limit}`),
  clearHistory: () => request('/history', { method: 'DELETE' }),
}
