import { build } from 'esbuild';
import { mkdir, copyFile, rm } from 'node:fs/promises';

await rm('dist',{recursive:true,force:true});
await mkdir('dist/desktop', { recursive: true });
await build({ entryPoints: ['src/desktop/main.ts', 'src/desktop/preload.ts', 'src/desktop/secure-prompt.ts', 'src/desktop/secure-prompt-preload.ts'], outdir: 'dist/desktop', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
await build({ entryPoints: ['src/desktop/renderer.ts'], outfile: 'dist/desktop/renderer.js', bundle: true, platform: 'browser', format: 'iife' });
await build({entryPoints:['src/desktop/settings-renderer.ts'],outfile:'dist/desktop/settings-renderer.js',bundle:true,platform:'browser',format:'iife'});
await copyFile('src/desktop/settings.html','dist/desktop/settings.html');
await copyFile('src/desktop/index.html', 'dist/desktop/index.html');
await copyFile('src/desktop/secure-prompt.html', 'dist/desktop/secure-prompt.html');
await build({ entryPoints: ['src/runtime/sidecar.ts'], outfile: 'dist/runtime/sidecar.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external' });
await build({ entryPoints: {'task-sidecar':'src/runtime/task-sidecar.ts','tools-plugin':'src/runtime/tools-plugin.ts','file-worker':'src/tools/file-worker.ts'}, outdir:'dist/runtime',outExtension:{'.js':'.mjs'}, bundle:true,platform:'node',format:'esm',packages:'external' });
