import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    fs: {
      // The demo may point at generated scenes kept beside 4DGaussians/.
      allow: [fileURLToPath(new URL('../../', import.meta.url))]
    }
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'four-dgs-player'
    },
    rollupOptions: {
      external: ['playcanvas'],
      output: {
        globals: { playcanvas: 'pc' }
      }
    }
  }
});
