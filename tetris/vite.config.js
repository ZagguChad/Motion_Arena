import { defineConfig } from 'vite';

export default defineConfig({
    root: './',
    publicDir: 'public',
    server: {
        port: 5173,
        open: true,
        proxy: {
            // FIX: Removed broken /ws proxy — game client connects directly to server port 3001
            // Proxy API calls (health, info, etc.) for convenience
            '/api': {
                target: 'http://localhost:3001',
                rewrite: (path) => path.replace(/^\/api/, ''),
            },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
});
