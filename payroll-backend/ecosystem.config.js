module.exports = {
  apps: [{
    name: 'payroll-backend',
    script: 'src/index.ts',
    interpreter: '/usr/local/bin/bun',
    interpreter_args: 'run',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '400M',
    error_file: '/app/logs/pm2-error.log',
    out_file: '/app/logs/pm2-out.log',
    merge_logs: true,
    time: true,
    env: {
      NODE_ENV: 'production',
    },
  }],
};
