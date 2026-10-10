import React from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App'
window.__render = () => { createRoot(document.getElementById('root')).render(<App />) }
