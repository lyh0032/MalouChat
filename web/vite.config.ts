import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const envDir = __dirname
  const env = loadEnv(mode, envDir, '')
  const target = env.VITE_API_BASE_URL || 'http://localhost:5172'

  return {
    envDir,
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|zustand)\//.test(id)) {
              return 'react-vendor'
            }
            if (id.includes('/node_modules/sortablejs/')) return 'sortable-vendor'
            if (id.includes('/node_modules/@antv/')) return 'graph-vendor'
            return undefined
          }
        }
      }
    },
    server: {
      allowedHosts: ['.trycloudflare.com'],
      port: 5173,
      proxy: {
        '/api': {
          target,
          changeOrigin: true
        },
        '/health': {
          target,
          changeOrigin: true
        }
      }
    }
  }
})
