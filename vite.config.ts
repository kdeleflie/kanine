import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command, mode }) => {
    const env = loadEnv(mode, '.', '');
    // Utilise le chemin relatif par défaut pour plus de souplesse, 
    // ou /kanine/ seulement pour la production GitHub.
    const base = process.env.GITHUB_ACTIONS === 'true' ? '/kanine/' : '/';
    
    return {
      base,
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        tailwindcss()
      ],
      define: {
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      }
    };
});
