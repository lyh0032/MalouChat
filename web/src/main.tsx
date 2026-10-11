import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import './style.css'
import './motion.css'
import './app.css'

const root = document.getElementById('app')

if (!root) {
  throw new Error('找不到应用挂载节点 #app')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
