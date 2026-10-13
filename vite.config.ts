import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'maplibre', test: /node_modules[\\/](maplibre-gl|@maplibre)[\\/]/, priority: 20 },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
});
