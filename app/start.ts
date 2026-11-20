import { startPracticeApp } from './server.ts';

const args = process.argv.slice(2);
const demo = !args.includes('--empty');
const ports = args.filter(arg => arg !== '--empty');
const value = ports[0] ?? '4355';
const port = Number(value);
if (ports.length > 1 || !/^\d+$/.test(value) || !Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('Choose a port between 0 and 65535. Use 0 to allocate a free port.');
  process.exit(1);
}

try {
  const app = await startPracticeApp(port, { demo });
  console.log('Flowstride Practice is running at ' + app.origin);
  console.log(demo ? 'Sample bookings are loaded. Restarting resets them.' : 'Starting with an empty booking workspace.');
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
