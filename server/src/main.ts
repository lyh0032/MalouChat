import { env } from './config/env'
import app from './app'
import os from 'os'
import { startCleanupScheduler } from './modules/files/cleanup.service'

const port = env.PORT

const getLocalIP = () => {
  const nets = os.networkInterfaces()

  for (const network of Object.values(nets)) {
    if (!network) continue

    for (const net of network) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return 'localhost'
}

app.listen(port, '0.0.0.0', () => {
  const localIp = getLocalIP()
  console.log(`Server running at http://localhost:${port} & http://${localIp}:${port}`)
  startCleanupScheduler()
})
