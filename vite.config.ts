
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { URL, fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  const isDevelopment = mode === 'development';

  return {
    plugins: [react()],
    define: {
      global: 'globalThis', // Ajout de cette ligne pour résoudre l'erreur "global is not defined"
    },
    server: {
      port: 3000,
      host: true,
      strictPort: false,
      // Conditionally apply the proxy only in development mode
      proxy: isDevelopment ? {
          '/api': {
              target: 'http://localhost:3001', // Default port for Vercel CLI dev server
              changeOrigin: true,
          },
      } : undefined,
      watch: {
        // Ignore the 'api' directory, as it's for serverless functions
        // and not part of the Vite frontend build process.
        ignored: ['**/api/**'],
      }
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            supabase: ['@supabase/supabase-js'],
            google: ['@google/genai']
          }
        }
      }
    }
  }
})
