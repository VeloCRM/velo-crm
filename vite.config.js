import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Fix Rolldown ASI bug: insert semicolons before createRoot calls
function fixASI() {
  return {
    name: 'fix-asi',
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.code) {
          file.code = file.code.replace(/\}(\(0,[a-z]\.createRoot\))/g, '};\n$1')
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), fixASI()],
})
