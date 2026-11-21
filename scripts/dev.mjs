import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npm, ['run', 'dev:web'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
  spawn(npm, ['run', 'dev:api'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
];

let exiting = false;

function stop(code = 0) {
  if (exiting) {
    return;
  }
  exiting = true;

  for (const child of children) {
    if (!child.pid) {
      continue;
    }
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => process.exit(code), 300);
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (!exiting) {
      stop(code ?? (signal ? 1 : 0));
    }
  });
  child.on('error', () => {
    stop(1);
  });
}

process.on('SIGINT', () => {
  stop(0);
});
process.on('SIGTERM', () => {
  stop(0);
});
