# GovtPrep — Backend API

GovtPrep is a government exam preparation platform (SSC, Banking, Railway, etc.) where students take timed mock tests, track scores/rank, and (eventually) read current affairs. This repository contains the **backend REST API** only — built with Node.js, Express, and MongoDB.

> **Status:** First-iteration MVP. The core content structure (categories → test series → tests → questions) and the full test-taking flow (start → answer → submit → result) are built. Several planned modules (current affairs, media upload, admin user management, search, notifications, reports, settings) are **not yet built** — see [Roadmap](#roadmap) below.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Framework | Express 5 |
| Database | MongoDB + Mongoose |
| Auth | JWT (`jsonwebtoken`) + `bcrypt` password hashing |
| Dev tools | `nodemon`, `dotenv` |

---

## Getting Started

### Prerequisites
- Node.js 18+
- A MongoDB connection string (local or Atlas)

### Installation
```bash
git clone https://github.com/deeprank-git/govt-backend-code.git
cd govt-backend-code
git checkout dev
npm install
```

### Environment Variables
Create a `.env` file in the project root:

```env
mongoDB_URL=mongodb+srv://<user>:<password>@<cluster>/<dbname>
JWT_SECRET=your_long_random_secret
JWT_EXPIRES_IN=7d
PORT=5000
HOST=0.0.0.0
```

### Run the Server
```bash
# development (auto-restart on file changes)
npm run dev

# production
npm start
```

The API will start at `http://localhost:5000`. Confirm it's running:
```bash
curl http://localhost:5000/api/health
```

---

## Project Structure

```
govt-backend-code/
├── index.js               # App entry point — Express setup, route mounting
├── db.js                  # MongoDB connection
├── models/                # Mongoose schemas
├── controllers/           # Business logic
├── routes/                # Express route definitions (public + admin split per resource)
├── middleware/             # authMiddleware (JWT check), authorize (role check)
└── utils/                  # generateToken helper
```

**Convention:** every resource with both student-facing and admin-facing access has two route files — e.g. `categoryRoutes.js` (read) and `categoryAdminRoutes.js` (write, admin-only) — both backed by the same controller.

---

## Authentication

All protected routes expect:
```
Authorization: Bearer <jwt_token>
```
Get a token via `POST /api/auth/register` or `POST /api/auth/login`. Roles are `student`, `instructor`, or `admin`. Admin-only routes are protected with `authorize("admin")`.

---

## API Reference

### Auth
| Method & Path | Access | Description |
|---|---|---|
| `POST /api/auth/register` | Public | Create an account, returns JWT |
| `POST /api/auth/login` | Public | Login, returns JWT |

### Categories
| Method & Path | Access | Description |
|---|---|---|
| `GET /api/categories` | Logged-in | List active categories |
| `GET /api/categories/:id` | Logged-in | Get one category |
| `POST /api/admin/categories` | Admin | Create category |
| `PATCH /api/admin/categories/:id` | Admin | Update category |
| `DELETE /api/admin/categories/:id` | Admin | Soft-delete category |

### Test Series
| Method & Path | Access | Description |
|---|---|---|
| `GET /api/test-series?category=` | Logged-in | List series (published+active only, unless admin) |
| `GET /api/test-series/:id` | Logged-in | Get one series |
| `POST /api/admin/test-series` | Admin | Create series |
| `PATCH /api/admin/test-series/:id` | Admin | Update series |
| `DELETE /api/admin/test-series/:id` | Admin | Soft-delete series |

### Tests
| Method & Path | Access | Description |
|---|---|---|
| `GET /api/tests?category=&testSeries=` | Logged-in | List tests (published+active only, unless admin) |
| `GET /api/tests/:id` | Logged-in | Get one test |
| `POST /api/admin/tests` | Admin | Create test |
| `PATCH /api/admin/tests/:id` | Admin | Update test |
| `DELETE /api/admin/tests/:id` | Admin | Soft-delete test |

### Questions
| Method & Path | Access | Description |
|---|---|---|
| `GET /api/questions?test=` | Student, Admin | Get a test's questions (correct answer hidden) |
| `GET /api/admin/questions?test=` | Admin | Get a test's questions (with correct answer) |
| `POST /api/admin/questions` | Admin | Create one question |
| `POST /api/admin/questions/bulk` | Admin | Bulk-create questions (array body) |
| `PATCH /api/admin/questions/:id` | Admin | Update question |
| `DELETE /api/admin/questions/:id` | Admin | Soft-delete question |

### Test Attempts (the test-taking flow)
| Method & Path | Access | Description |
|---|---|---|
| `POST /api/test-attempts/start` | Logged-in | Start (or resume) an attempt for a test |
| `GET /api/test-attempts/:id/question/:index` | Owner | Get a question by position (Next/Previous) |
| `POST /api/test-attempts/save-answer` | Owner | Save/update an answer |
| `POST /api/test-attempts/submit` | Owner | Submit and score the attempt |
| `GET /api/test-attempts/:id/result` | Owner or Admin | Full question-by-question result breakdown |
| `GET /api/test-attempts/my-attempts` | Logged-in | Attempt history for the logged-in student |

### Misc
| Method & Path | Access | Description |
|---|---|---|
| `GET /api/health` | Public | Health check |

Full detailed explanation of every endpoint's behavior, edge cases, and a gap analysis against the original project plan is in [`GovtPrep-Backend-Workflow-and-Status.md`](./GovtPrep-Backend-Workflow-and-Status.md).

---

## Roadmap

Not yet built, in priority order:
1. `GET/PUT /api/users/me` — student profile
2. `GET/PUT /api/admin/users` — admin user management (view/block/unblock)
3. `GET /api/leaderboard/:testId` — rank list per test
4. `GET /api/search?q=` — global search
5. Current Affairs module (model + student + admin routes)
6. Media upload (`Media` model + `POST /api/admin/media/upload`)
7. Question reporting (`POST /api/users/me/report-question` + admin review)
8. Static pages module (About/Contact)
9. Site-wide settings module
10. Admin analytics dashboard endpoint
11. Refresh tokens for longer-lived sessions
12. Background cron job for auto-submitting expired test attempts
13. In-app notifications

---

## Known Conventions / Notes for Contributors

- **Soft deletes everywhere** — `DELETE` routes set `isActive: false` rather than removing documents. Never assume a delete is permanent.
- **PATCH, not PUT**, is used for all update routes.
- **Auto-calculated fields:** `Test.totalQuestions`/`totalMarks` and `TestSeries.totalTests` are recalculated automatically by the relevant controllers — don't set them manually via the API.
- **Auto-submit is currently lazy**, not a background job: an expired attempt is only finalized the next time it's touched by an API call, not on a timer. Keep this in mind if building anything that depends on attempts being finalized promptly.
- No input-validation library is wired up yet (relies on Mongoose schema validation). No automated tests exist yet.
