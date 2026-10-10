import { JSDOM } from 'jsdom'
import { readFileSync } from 'fs'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/', pretendToBeVisual: true, runScripts: 'outside-only',
})
const w = dom.window
w.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} }
w.DOMMatrixReadOnly = class { constructor(t){ const m=(t||'').match(/matrix\(([^)]+)\)/); const p=m?m[1].split(',').map(Number):[1,0,0,1,0,0]; this.m22=p[3]; this.m41=p[4]; this.m42=p[5] } }
w.matchMedia = w.matchMedia || (() => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }))
Object.defineProperties(w.HTMLElement.prototype, {
  offsetHeight: { get(){ return 600 } }, offsetWidth: { get(){ return 800 } },
})
w.SVGElement.prototype.getBBox = () => ({ x:0, y:0, width:10, height:10 })
const nodeFetch = globalThis.fetch
w.fetch = async (url, opts) => {
  const full = String(url).startsWith('/') ? 'http://127.0.0.1:5000' + url : url
  const r = await nodeFetch(full, opts)
  return { ok: r.ok, status: r.status, json: () => r.json() }
}
w.localStorage.setItem('sr-theme', 'dark')

const errors = []
w.console.error = (...a) => errors.push(a.join(' '))
w.console.warn = () => {}

globalThis.window = w; globalThis.document = w.document; Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true })
globalThis.HTMLElement = w.HTMLElement; globalThis.Element = w.Element; globalThis.Node = w.Node
globalThis.ResizeObserver = w.ResizeObserver; globalThis.DOMMatrixReadOnly = w.DOMMatrixReadOnly
globalThis.SVGElement = w.SVGElement; globalThis.getComputedStyle = w.getComputedStyle.bind(w)
globalThis.requestAnimationFrame = w.requestAnimationFrame.bind(w)
globalThis.cancelAnimationFrame = w.cancelAnimationFrame.bind(w)
globalThis.fetch = w.fetch
globalThis.localStorage = w.localStorage

const code = readFileSync(new URL('./smoke-bundle.js', import.meta.url), 'utf8')
new Function(code).call(w)
w.__render()

await new Promise((r) => setTimeout(r, 2500))
const text = w.document.body.textContent
const checks = [
  ['renders header', text.includes('SmartRoute AI')],
  ['backend online', text.includes('backend online')],
  ['route computed', /PC1/.test(text) && text.includes('Active route')],
  ['health card value', /Health score/.test(text)],
  ['model loaded', text.includes('Live metrics')],
  ['no react errors', errors.length === 0],
]
const click = async (label, ms = 1200) => {
  const el = [...w.document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(label))
  if (!el) return false
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, ms))
  return true
}

checks.push(['send packet', await click('Send packet')])
checks.push(['tab: comparison', await click('Algorithm comparison', 400)])
checks.push(['run comparison', await click('Run algorithm comparison', 1800)])
checks.push(['comparison table populated', /Best by health score/.test(w.document.body.textContent)])
checks.push(['tab: what-if', await click('What-if simulator', 400)])
checks.push(['run what-if', await click('Run what-if scenario', 1800)])
checks.push(['what-if delta rendered', /Delta/.test(w.document.body.textContent)])
checks.push(['tab: ai model', await click('AI model', 600)])
checks.push(['model stats rendered', /ROC-AUC/.test(w.document.body.textContent)])
checks.push(['tab: storage', await click('Save / history', 600)])
checks.push(['history rendered', /Simulation history/.test(w.document.body.textContent)])
checks.push(['theme toggle', await click('\u2600', 400) || await click('\u263e', 400)])
checks.push(['add router', await click('+ Router', 500)])
checks.push(['no errors after interaction', errors.length === 0])

let bad = 0
for (const [n, ok] of checks) { console.log((ok ? '  PASS  ' : '  FAIL  ') + n); if (!ok) bad++ }
if (errors.length) console.log('console.error output:\n' + errors.slice(0, 5).join('\n---\n'))
process.exit(bad ? 1 : 0)
