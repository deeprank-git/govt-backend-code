// tests/env.setup.js
//
// Runs before each test file's imports (Jest `setupFiles`). Provides the
// env vars the app reads at request time (JWT_SECRET etc.) without needing
// a real .env file or dotenv — tests never hit a real database or SMTP
// server, so nothing else from .env.example is required.

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "1h";
