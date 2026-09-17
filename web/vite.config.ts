import { networkInterfaces } from 'node:os'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The laptop's address on the local network: the phone opens this, the QR code encodes it.
const lanIp =
  Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address ?? 'localhost'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true, // lets a public tunnel reach the dev server when the venue Wi-Fi blocks phone-to-laptop
    port: 5173,
    strictPort: true,
    // The phone talks to the web server only; it forwards to FastAPI. No CORS, no second address to reach.
    proxy: { '/api': 'http://localhost:8000', '/files': 'http://localhost:8000' },
  },
  define: { __LAN_IP__: JSON.stringify(process.env.LAN_IP ?? lanIp) },
})
