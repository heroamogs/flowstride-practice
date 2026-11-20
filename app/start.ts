import { startPracticeApp } from './server.ts';

const value = process.argv[2] ?? '4355';
const port = Number(value);
if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('Choose a port between 0 and 65535. Use 0 to allocate a free port.');
  process.exit(1);
}

try {
  const app = await startPracticeApp(port);
  console.log('Flowstride Practice is running at ' + app.origin);
  console.log('Press Ctrl+C to stop. Restarting restores the sample data.');
  const stop = () => { void app.close(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  const issue = error as NodeJS.ErrnoException;
  console.error(issue.code === 'EADDRINUSE'
    ? 'That port is in use. Try npm start -- 4356 and set BASE_URL to the printed URL.'
    : 'Could not start Flowstride Practice. ' + issue.message);
  process.exitCode = 1;
}
