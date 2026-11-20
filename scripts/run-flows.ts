import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startPracticeApp } from '../app/server.ts';

const args = process.argv.slice(2);
const target = args[0] && !args[0].startsWith('-') ? args.shift() : undefined;
const cli = fileURLToPath(new URL('cli/index.js', import.meta.resolve('flowstride')));
const suites = target
  ? [{ target, options: args }]
  : [
      { target: 'flows', options: args },
      { target: 'browser-lessons', options: ['--config', 'browser-lessons/flowstride.config.json', ...args] },
    ];

for (const suite of suites) {
  const app = await startPracticeApp(0);
  const child = spawn(process.execPath, [cli, 'run', suite.target, '--ci', ...suite.options], {
    stdio: 'inherit',
    env: { ...process.env, BASE_URL: app.origin },
  });
  const interrupt = () => { child.kill('SIGINT'); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const code = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (status, signal) => resolve(status ?? (signal ? 130 : 1)));
    });
    if (code) process.exitCode = code;
    if (code === 130) break;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    await app.close();
  }
}
