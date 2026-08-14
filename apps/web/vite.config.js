import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { proxy: { '/api': 'http://localhost:3000', '/socket.io': { target: 'http://localhost:3000', ws: true } } }, test: { environment: 'jsdom', setupFiles: './src/test-setup.ts', exclude: ['**/node_modules/**', '**/dist/**'] } });
