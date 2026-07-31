module.exports = {
  apps: [
    {
      name: "govt-backend",
      script: "index.js",
      interpreter: "node",
      cwd: "/root/govt-prep/govt-backend-code",
      env: {
        PORT: 5006,
        NODE_ENV: "production",
      },
    },
  ],
};