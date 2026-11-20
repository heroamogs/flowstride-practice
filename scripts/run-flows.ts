import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startPracticeApp } from '../app/server.ts';

const lesson = process.argv[2] || 'flows';
if (process.argv.length > 3) throw new Error('Pass at most one flow or directory to test.');
const cli = new URL('cli/index.js', import.meta.resolve('flowstride'));
const app = await startPracticeApp(0);

try {
  const child = spawn(process.execPath, [fileURLToPath(cli), 'run', lesson, '--ci'], {
    stdio: 'inherit',
    env: { ...process.env, BASE_URL: app.origin },
  });
  const interrupt = () => { child.kill('SIGINT'); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', status => resolve(status ?? 1));
  });
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  process.exitCode = code;
} finally {
  await app.close();
}
