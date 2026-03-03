const path = require("path");

const root = __dirname;

module.exports = {
  apps: [
    {
      name: "impulse-bot",
      cwd: root,
      script: "node",
      args: "dist/index.js",
      interpreter: "none",
      env: { NODE_ENV: "production" },
      autorestart: true,
      watch: false,
    },
    {
      name: "impulse-frontend",
      cwd: path.join(root, "frontend"),
      script: "npm",
      args: "run start",
      interpreter: "none",
      env: { NODE_ENV: "development" },
      autorestart: true,
      watch: false,
    },
  ],
};
