# StudentCo Backend

Auth API for the StudentCo frontend.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Backend runs on `http://localhost:5001`.

## Endpoints

| Method | Path               | Body                                     | Auth   | Description              |
| ------ | ------------------ | ---------------------------------------- | ------ | ------------------------ |
| GET    | `/api/health`      | —                                        | No     | Health check             |
| POST   | `/api/auth/register` | `{ name, email, password, role }`      | No     | Create account, get JWT  |
| POST   | `/api/auth/login`  | `{ email, password }`                    | No     | Login, get JWT           |
| GET    | `/api/auth/me`     | — (`Authorization: Bearer <token>`)      | Yes    | Current user             |
| GET    | `/api/activities`  | `?category=&q=`                          | No¹    | List activities          |
| GET    | `/api/activities/:id` | —                                     | No¹    | Activity detail          |
| POST   | `/api/activities`  | `{ title, venue, seatsTotal, … }`        | Staff/Organizer | Publish activity |
| POST   | `/api/activities/:id/register` | —                           | Yes    | Join activity            |
| DELETE | `/api/activities/:id/register` | —                           | Yes    | Leave activity           |

¹ Pass `Authorization: Bearer <token>` and each activity includes `registered: true/false` for that user.

Valid `role` values: `Student`, `Staff`, `Organizer`.

Users are stored in `data/users.json` (git-ignored, file-backed — swap for a real DB later).
Passwords are hashed with bcrypt. Sessions are JWTs (`JWT_SECRET` in `.env`).

## Frontend wiring

Set in `Studentco/.env`:

```ini
VITE_API_URL=http://localhost:5001
```

The frontend (`src/lib/api.js` + `src/store/auth.jsx`) calls these endpoints and
falls back to the localStorage demo session if the backend is offline.
