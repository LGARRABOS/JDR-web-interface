const { spawn } = require('node:child_process');

const processes = [];

function startProcess(label, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  child.on('error', (error) => {
    console.error(`[${label}] failed to start:`, error.message);
    shutdown();
    process.exit(1);
  });

  child.on('exit', (code) => {
    const message = code === 0
      ? `${label} exited cleanly.`
      : `${label} exited with code ${code}.`;
    console.log(message);

    if (code && code !== 0) {
      shutdown();
      process.exit(code);
    }
  });

  processes.push(child);
}

function shutdown() {
  processes.forEach((child) => {
    if (!child.killed) {
      child.kill();
    }
  });
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

process.on('exit', () => {
  shutdown();
});

startProcess('backend', 'npm', ['run', 'dev', '--prefix', 'backend']);
startProcess('frontend', 'npm', ['run', 'dev', '--prefix', 'frontend']);
