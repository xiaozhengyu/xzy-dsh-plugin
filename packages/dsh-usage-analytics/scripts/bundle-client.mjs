/**
 * Build the packaged client half: bundle src/client.ts → lib/client.js as a
 * CJS bundle wrapped in `window.__ModuleLoader__.load({ id, factory })`
 * (the DSH browser module-loader contract — see doc/harness-api.md §7.4).
 *
 * All dsh/React packages are EXTERNALS resolved through the shell's static
 * module seed at runtime; the bundle itself must not inline them.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'src', 'client', 'client.ts');
const outfile = join(root, 'lib', 'client.js');

mkdirSync(join(root, 'lib'), { recursive: true });

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  minify: false,
  banner: {
    js: `window.__ModuleLoader__.load({ id: 'dsh-usage-analytics', factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });`,
  },
  footer: {
    js: `return module.exports; } });`,
  },
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-web-react',
    '@deepseek-ai/dsh-client-ui-attachment',
    '@deepseek-ai/dsh-client-schema-form',
    '@deepseek-ai/dsh-typert-protocol',
  ],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});

console.log(`client bundle written to ${outfile}`);
