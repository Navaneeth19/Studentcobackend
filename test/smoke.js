// Backend smoke tests — isolated temp data dir, ephemeral port.
// Usage: npm test
const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studentco-test-"));
process.env.STUDENTCO_DATA_DIR = tmp;
process.env.JWT_SECRET = "test-secret";

const { createApp } = require("../src/app");
const { saveUser } = require("../src/store/userStore");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

let base;
let server;
const j = (m, p, body, token) =>
  fetch(base + p, {
    method: m,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

async function seedUser(name, email, role, password = "secret123") {
  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    role,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString(),
  };
  saveUser(user);
  return user;
}

let studentToken, teacherToken, principalToken, adminToken, activityId, noticeId, student2;

before(async () => {
  const app = createApp();
  server = app.listen(0);
  await new Promise((res) => server.on("listening", res));
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((res) => server.close(res));
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("health + auth", () => {
  it("GET /api/health → ok", async () => {
    const r = await j("GET", "/api/health");
    assert.equal(r.s, 200);
    assert.equal(r.b.ok, true);
  });

  it("student registers (201), duplicate (409), teacher blocked (403), bad input (400)", async () => {
    let r = await j("POST", "/api/auth/register", { name: "T Student", email: "s@t.school", password: "secret123", role: "Student" });
    assert.equal(r.s, 201);
    studentToken = r.b.token;
    r = await j("POST", "/api/auth/register", { name: "T Student", email: "s@t.school", password: "secret123", role: "Student" });
    assert.equal(r.s, 409);
    r = await j("POST", "/api/auth/register", { name: "T", email: "bad", password: "x", role: "Teacher" });
    assert.equal(r.s, 400);
    r = await j("POST", "/api/auth/register", { name: "T Teacher", email: "t@t.school", password: "secret123", role: "Teacher" });
    assert.equal(r.s, 403);
  });

  it("login works; wrong password 401; /me needs token", async () => {
    let r = await j("POST", "/api/auth/login", { email: "s@t.school", password: "secret123" });
    assert.equal(r.s, 200);
    r = await j("POST", "/api/auth/login", { email: "s@t.school", password: "nope123" });
    assert.equal(r.s, 401);
    r = await j("GET", "/api/auth/me");
    assert.equal(r.s, 401);
    r = await j("GET", "/api/auth/me", null, studentToken);
    assert.equal(r.s, 200);
    assert.equal(r.b.user.email, "s@t.school");
  });

  it("unknown API route → 404 JSON", async () => {
    const r = await j("GET", "/api/nope");
    assert.equal(r.s, 404);
    assert.ok(r.b.message);
  });

  it("assistant validates input (empty message → 400, no keys spent)", async () => {
    const r = await j("POST", "/api/assistant/chat", { message: "   ", events: [], notices: [] });
    assert.equal(r.s, 400);
  });
});

describe("activities", () => {
  it("lists seeded activities with pagination fields", async () => {
    const r = await j("GET", "/api/activities?limit=2&offset=1");
    assert.equal(r.s, 200);
    assert.equal(r.b.activities.length, 2);
    assert.ok(r.b.total >= 6);
  });

  it("student cannot publish (403); teacher can (201); update + delete flow", async () => {
    await seedUser("T Teacher", "t@t.school", "Teacher");
    await seedUser("T Principal", "p@t.school", "Principal");
    teacherToken = (await j("POST", "/api/auth/login", { email: "t@t.school", password: "secret123" })).b.token;
    principalToken = (await j("POST", "/api/auth/login", { email: "p@t.school", password: "secret123" })).b.token;
    adminToken = principalToken;

    let r = await j("POST", "/api/activities", { title: "Nope", venue: "X", seatsTotal: 5 }, studentToken);
    assert.equal(r.s, 403);
    r = await j("POST", "/api/activities", { title: "Hi", venue: "X", seatsTotal: 0 }, teacherToken);
    assert.equal(r.s, 400);
    r = await j("POST", "/api/activities", { title: "Test Cup", venue: "Test Ground", seatsTotal: 20 }, teacherToken);
    assert.equal(r.s, 201);
    activityId = r.b.activity.id;

    r = await j("PUT", `/api/activities/${activityId}`, { title: "Test Cup v2" }, studentToken);
    assert.equal(r.s, 403);
    r = await j("PUT", `/api/activities/${activityId}`, { title: "Test Cup v2" }, teacherToken);
    assert.equal(r.s, 200);
    assert.equal(r.b.activity.title, "Test Cup v2");
    r = await j("PUT", `/api/activities/${activityId}`, { seatsTotal: 0 }, teacherToken);
    assert.equal(r.s, 400);

    r = await j("DELETE", `/api/activities/${activityId}`, null, teacherToken);
    assert.equal(r.s, 403);
    r = await j("DELETE", `/api/activities/${activityId}`, null, principalToken);
    assert.equal(r.s, 200);
    r = await j("GET", `/api/activities/${activityId}`);
    assert.equal(r.s, 404);
  });

  it("join → checkin → already-checked-in → ghost 404", async () => {
    const created = await j("POST", "/api/activities", { title: "Join Me", venue: "Hall", seatsTotal: 5 }, teacherToken);
    const id = created.b.activity.id;
    let r = await j("POST", `/api/activities/${id}/register`, null, studentToken);
    assert.equal(r.s, 201);
    r = await j("POST", `/api/activities/${id}/checkin`, { email: "s@t.school" }, studentToken);
    assert.equal(r.s, 403);
    r = await j("POST", `/api/activities/${id}/checkin`, { email: "s@t.school" }, teacherToken);
    assert.equal(r.s, 201);
    assert.equal(r.b.status, "checked-in");
    r = await j("POST", `/api/activities/${id}/checkin`, { email: "s@t.school" }, teacherToken);
    assert.equal(r.s, 200);
    assert.equal(r.b.status, "already-checked-in");
    r = await j("POST", `/api/activities/${id}/checkin`, { email: "ghost@t.school" }, teacherToken);
    assert.equal(r.s, 404);
    r = await j("GET", `/api/activities/${id}/registrations`, null, teacherToken);
    assert.equal(r.b.users[0].checkedIn, true);
  });
});

describe("announcements", () => {
  it("list → staff create → update → delete (student blocked throughout)", async () => {
    let r = await j("GET", "/api/announcements");
    assert.equal(r.s, 200);
    assert.ok(r.b.count >= 4);
    r = await j("POST", "/api/announcements", { title: "Hi", body: "Trying as student" }, studentToken);
    assert.equal(r.s, 403);
    r = await j("POST", "/api/announcements", { title: "Test", body: "x" }, teacherToken);
    assert.equal(r.s, 400);
    r = await j("POST", "/api/announcements", { title: "Test notice", body: "This is a live test notice.", tag: "Test" }, teacherToken);
    assert.equal(r.s, 201);
    noticeId = r.b.announcement.id;
    r = await j("PUT", `/api/announcements/${noticeId}`, { title: "Test notice v2" }, teacherToken);
    assert.equal(r.s, 200);
    r = await j("DELETE", `/api/announcements/${noticeId}`, null, teacherToken);
    assert.equal(r.s, 403);
    r = await j("DELETE", `/api/announcements/${noticeId}`, null, principalToken);
    assert.equal(r.s, 200);
    r = await j("GET", "/api/announcements");
    assert.ok(!r.b.announcements.some((n) => n.id === noticeId));
  });
});

describe("admin", () => {
  it("overview + users need staff; principal manages accounts", async () => {
    let r = await j("GET", "/api/admin/overview", null, studentToken);
    assert.equal(r.s, 403);
    r = await j("GET", "/api/admin/overview", null, teacherToken);
    assert.equal(r.s, 403);
    r = await j("GET", "/api/admin/overview", null, principalToken);
    assert.equal(r.s, 200);
    assert.ok(r.b.totals.activities >= 6);

    r = await j("POST", "/api/admin/users", { name: "Kid Two", email: "s2@t.school", password: "secret123", role: "Teacher" }, studentToken);
    assert.equal(r.s, 403);
    r = await j("POST", "/api/admin/users", { name: "Kid Two", email: "s2@t.school", password: "secret123", role: "Student" }, principalToken);
    assert.equal(r.s, 201);
    student2 = r.b.user;

    r = await j("GET", "/api/admin/users?role=Student", null, principalToken);
    assert.equal(r.s, 200);
    assert.ok(r.b.users.some((u) => u.email === "s2@t.school"));

    r = await j("PATCH", `/api/admin/users/${student2.id}`, { role: "Teacher" }, principalToken);
    assert.equal(r.s, 200);
    assert.equal(r.b.user.role, "Teacher");
    r = await j("PATCH", `/api/admin/users/${student2.id}`, { role: "Nope" }, principalToken);
    assert.equal(r.s, 400);

    r = await j("POST", `/api/admin/users/${student2.id}/reset-password`, { password: "newpass123" }, principalToken);
    assert.equal(r.s, 200);
    r = await j("POST", "/api/auth/login", { email: "s2@t.school", password: "newpass123" });
    assert.equal(r.s, 200);

    r = await j("DELETE", `/api/admin/users/${student2.id}`, null, teacherToken);
    assert.equal(r.s, 403);
    r = await j("DELETE", `/api/admin/users/${student2.id}`, null, principalToken);
    assert.equal(r.s, 200);
    r = await j("POST", "/api/auth/login", { email: "s2@t.school", password: "newpass123" });
    assert.equal(r.s, 401);
  });
});
