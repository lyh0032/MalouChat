import { t } from './i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './i18n'
import App from './App'
import './style.css'
import './motion.css'
import './app.css'

const root = document.getElementById('app')

if (!root) {
  throw new Error(t('ui.applicationRootAppWasNotFound'))
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
