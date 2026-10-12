import './config/secrets'
import { startServer } from './server'

startServer().catch((error: Error) => {
  console.error(`Backend startup failed: ${error.message}`)
  process.exit(1)
})
