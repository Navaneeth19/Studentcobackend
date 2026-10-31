# StudentCo Backend

Express API for the StudentCo campus app — auth, activities, announcements,
attendance check-ins, and admin.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Backend runs on `http://localhost:5001`.

## Scripts

| Command                | What it does                                            |
| ---------------------- | ------------------------------------------------------- |
| `npm run dev`          | Start with auto-reload (`node --watch`)                 |
| `npm start`            | Start production server                                 |
| `npm test`             | Smoke tests (`node --test`, isolated temp data dir)    |
| `npm run create-user`  | Create any-role account: `npm run create-user -- "Name" email password "Role"` |
| `npm run seed-firebase`| Mirror users into Firebase Auth (needs service account — see below) |

## Endpoints

Auth — `POST /api/auth/register` is **Student-only** (returns 403 for other
roles); staff accounts are created by a Principal via the admin API or the
`create-user` script.

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/health` | No | Health check |
| POST | `/api/auth/register` | No | Create **Student** account, get JWT + verify-email OTP |
| POST | `/api/auth/login` | No | Login, get JWT |
| POST | `/api/auth/request-code` | No | Send 6-digit OTP `{ email, purpose }` — `verify-email`/`reset-password`/`passwordless` |
| POST | `/api/auth/verify-email` | No | Verify email `{ email, code }` |
| POST | `/api/auth/reset-password` | No | Reset password `{ email, code, newPassword }` (revokes old JWTs) |
| POST | `/api/auth/passwordless/verify` | No | Sign in without password `{ email, code }` (auto-creates Student) |
| POST | `/api/auth/firebase` | Firebase ID token | Exchange for backend JWT (auto-provisions Student) |
| GET | `/api/auth/me` | Yes | Current user |
| GET | `/api/activities?category=&q=&limit=&offset=` | No¹ | List activities (paginated) |
| GET | `/api/activities/:id` | No¹ | Activity detail |
| POST | `/api/activities` | Teacher/AA/Principal | Publish activity |
| PUT | `/api/activities/:id` | Teacher/AA/Principal | Edit activity |
| DELETE | `/api/activities/:id` | AA/Principal | Remove activity (+ cleans regs/check-ins) |
| POST | `/api/activities/:id/register` | Yes | Join activity |
| DELETE | `/api/activities/:id/register` | Yes | Leave activity |
| GET | `/api/activities/:id/registrations` | Teacher/AA/Principal | Attendee list + check-in flags |
| POST | `/api/activities/:id/checkin` | Teacher/AA/Principal | Verify ticket `{ email }`, mark entry |
| GET | `/api/announcements` | No | Notice board (pinned first) |
| POST | `/api/announcements` | Teacher/AA/Principal | Publish notice |
| PUT | `/api/announcements/:id` | Teacher/AA/Principal | Edit notice |
| DELETE | `/api/announcements/:id` | AA/Principal | Remove notice |
| GET | `/api/admin/overview` | AA/Principal | Campus stats, categories, per-activity fill |
| GET | `/api/admin/users?role=&q=&limit=&offset=` | AA/Principal | Account directory (no password hashes) |
| POST | `/api/admin/users` | Principal | Create any-role account |
| PATCH | `/api/admin/users/:id` | Principal | Rename / change role (last-Principal + self-demote protected) |
| DELETE | `/api/admin/users/:id` | Principal | Remove account + their regs/check-ins (self/last-Principal protected) |
| POST | `/api/admin/users/:id/reset-password` | Principal | Set a new password |

¹ Pass `Authorization: Bearer <token>` and each activity includes `registered: true/false` for that user.

Valid `role` values: `Student`, `Teacher`, `Activity Administrator`, `Principal`.

Conventions: success shapes are `{ user }`, `{ activity }`, `{ announcement }`, `{ users }` etc.;
errors are always `{ message }` with 400 (validation), 401 (auth), 403 (role),
404 (missing), 409 (conflict).

## Data

File-backed JSON in `data/` (git-ignored — swap for a real DB later):
`users.json`, `activities.json`, `announcements.json`, `registrations.json`,
`checkins.json`. Seeds live in `src/data/` and populate empty files on boot.
Set `STUDENTCO_DATA_DIR` to override the data dir (tests use a temp dir).

Passwords are hashed with bcrypt. Sessions are JWTs (`JWT_SECRET` in `.env`).
Firebase linking needs `.firebase-service-account.json` (git-ignored, never commit).

## Frontend wiring

Set in `Studentco/.env`:

```ini
VITE_API_URL=http://localhost:5001
```
