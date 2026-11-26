import { defineConfig } from 'tsup';

export default defineConfig([
  // The SDK: ESM + CJS + types, no Node-only imports.
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'es2022',
  },
  // The `iemails` command (bin). Node only, ESM.
  {
    entry: { cli: 'cli/index.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node20',
    banner: { js: '#!/usr/bin/env node' },
    sourcemap: false,
    clean: false,
  },
]);
