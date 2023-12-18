import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue({
    template: {
      compilerOptions: {
        isCustomElement: (tag) => tag.endsWith("-color-picker"),
      }
    }
  })],
  server: {
    host: "0.0.0.0"
  }
})
