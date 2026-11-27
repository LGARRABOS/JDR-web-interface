import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Identifiant de la version construite : APP_VERSION si fourni (déploiement),
 * sinon le commit git, sinon l'heure du build. Voir core/version/version.ts.
 */
function buildVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    return execSync('git rev-parse --short=12 HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return String(Date.now());
  }
}

/** Écrit dist/version.json : la page le compare à la version qu'elle a chargée. */
function versionFile(version: string): Plugin {
  return {
    name: 'jdr-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version }),
      });
    },
  };
}

export default defineConfig(({ command }) => {
  // En dev, pas de version : la vérification est désactivée.
  const version = command === 'build' ? buildVersion() : '';
  return {
    plugins: [react(), versionFile(version)],
    define: { __APP_VERSION__: JSON.stringify(version) },
    // Alias « @/ » = frontend/src (voir tsconfig.json, paths).
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
