import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { webTerminalPlugin } from './src/server/vite-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), webTerminalPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/client"),
      "@shared": path.resolve(__dirname, "./src/shared"),
    },
  },
  server: {
    port: 5175,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      ...(process.env.ALLOWED_HOSTS?.split(',').map(h => h.trim()).filter(Boolean) ?? [])
    ],
    watch: {
      ignored: ['**/.env*'],
    },
  },
})
