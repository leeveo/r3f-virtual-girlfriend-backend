module.exports = {
  apps: [
    {
      name: 'r3f-backend',
      script: 'index.js',
      cwd: '/home/adminuser/backend/r3f-virtual-girlfriend-backend', // ✅ Bon chemin
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        USE_NGROK: 'false'
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true
    },
    {
      name: 'ngrok-tunnel',
      script: 'ngrok-service.js',
      cwd: '/home/adminuser/backend/r3f-virtual-girlfriend-backend', // ✅ Bon chemin
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true
    }
  ]
};
