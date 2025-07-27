module.exports = {
  apps: [
    {
      name: "r3f-backend",
      script: "./index.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    },
    {
      name: "ngrok-tunnel",
      script: "./ngrok-service.js",
      interpreter: "node",
      watch: false
    }
  ]
};
