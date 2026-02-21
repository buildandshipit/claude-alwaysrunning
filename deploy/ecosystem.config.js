/**
 * PM2 Ecosystem Configuration
 *
 * Deploy claude-alwaysrunning with PM2 for production use.
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 stop claude-always
 *   pm2 restart claude-always
 *   pm2 logs claude-always
 */

module.exports = {
  apps: [{
    name: 'claude-always',
    script: './bin/claude-always.js',
    args: 'start -f --remote',
    cwd: process.env.CLAUDE_ALWAYS_DIR || '/opt/claude-alwaysrunning',

    // Restart settings
    restart_delay: 2000,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',

    // Resource limits
    max_memory_restart: '1G',

    // Logging
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/claude-always/error.log',
    out_file: '/var/log/claude-always/out.log',
    merge_logs: true,

    // Environment
    env: {
      NODE_ENV: 'production'
    },

    // Watch for changes (disable in production)
    watch: false,
    ignore_watch: ['node_modules', 'logs', '.git']
  }]
};
