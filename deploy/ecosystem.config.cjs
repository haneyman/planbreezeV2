const fs = require('node:fs');
module.exports = {
  apps: [{
    name: 'planbreeze-api',
    cwd: fs.realpathSync('/opt/planbreeze/current'),
    script: 'server/dist/server/src/main.js',
    interpreter: '/usr/bin/node',
    node_args: '--env-file=/etc/planbreeze/api.env',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    restart_delay: 3000,
    kill_timeout: 15000,
    time: true,
  }, {
    name: 'planbreeze-web',
    cwd: fs.realpathSync('/opt/planbreeze/current'),
    script: 'web-server.mjs',
    interpreter: '/usr/bin/node',
    instances: 1,
    exec_mode: 'fork',
    env: { HOST: '10.0.0.240', PORT: '8080' },
    autorestart: true,
    restart_delay: 3000,
    time: true,
  }],
};
