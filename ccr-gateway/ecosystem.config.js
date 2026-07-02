module.exports = {
  apps: [
    {
      name: 'ccr-edge',
      script: 'dist/edge.js',
      cwd: __dirname,
      env: { PORT: '8080', CORE_URL: 'http://127.0.0.1:8081' },
      autorestart: true,
      max_restarts: 50,
      min_uptime: '5s',
      restart_delay: 500,
      out_file: './logs/ccr-edge.out.log',
      error_file: './logs/ccr-edge.err.log',
    },
    {
      name: 'ccr-core',
      script: 'dist/server.js',
      cwd: __dirname,
      env: { PORT: '8081' },
      autorestart: true,
      max_restarts: 50,
      min_uptime: '5s',
      restart_delay: 1000,
      out_file: './logs/ccr-core.out.log',
      error_file: './logs/ccr-core.err.log',
    },
  ],
};
