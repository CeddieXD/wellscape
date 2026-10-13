// Wellscape backend — plain Node/Express.
//   POST /api/auth/register  { name, email, password } -> { user: {id, name, email} }
//   POST /api/auth/login     { email, password }        -> { user: {id, name, email} }
//   GET  /api/auth/session   (cookie)                   -> { user } | 401
//   POST /api/auth/logout                               -> { ok: true }
//   GET  /api/wellness                                  -> summary
//   POST /api/wellness/complete {taskId}                -> records task completion
//   GET/POST   /api/checkins                            -> daily wellness check-ins (SQLite)
//   GET/PUT/DELETE /api/checkins/:id

import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ---------------------------------------------------------------------------
// Data stores, persisted to disk so accounts & sessions survive restarts.
// Register once, log in forever — no re-registering after a server restart.
// ---------------------------------------------------------------------------
/** @type {Map<string, {id:string,name:string,email:string,passwordHash:string,salt:string}>} */
const usersByEmail = new Map();
/** @type {Map<string, string>} sessionId -> userId */
const sessions = new Map();
/** @type {Map<string, {id:string,name:string,email:string}>} userId -> user */
const usersById = new Map();
/** @type {Map<string, Array<{taskId:string, label:string, at:string}>>} userId -> completed tasks */
const wellnessByUser = new Map();

const SESSION_COOKIE = "wellscape.sid";

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

// Load persisted data on startup (if present).
function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const data = JSON.parse(raw);
    for (const user of data.users ?? []) {
      usersByEmail.set(user.email, user);
      usersById.set(user.id, publicUser(user));
    }
    for (const [sid, userId] of data.sessions ?? []) {
      sessions.set(sid, userId);
    }
    for (const [userId, log] of data.wellness ?? []) {
      wellnessByUser.set(userId, log);
    }
    console.log(
      `📂 Loaded ${usersByEmail.size} user(s) and ${sessions.size} session(s) from disk.`
    );
  } catch (err) {
    console.warn("⚠️ Could not load persisted store, starting fresh:", err.message);
  }
}

// Persist the current state. Writes atomically via a temp file + rename so a
// crash mid-write can't corrupt the store.
let saveQueued = false;
function saveStore() {
  // Debounce bursts of writes into a single flush on the next tick.
  if (saveQueued) return;
  saveQueued = true;
  queueMicrotask(() => {
    saveQueued = false;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const data = {
        users: [...usersByEmail.values()],
        sessions: [...sessions.entries()],
        wellness: [...wellnessByUser.entries()],
      };
      const tmp = DATA_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, DATA_FILE);
    } catch (err) {
      console.warn("⚠️ Failed to persist store:", err.message);
    }
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const jar = {};
  if (!header) return jar;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    jar[key] = value;
  }
  return jar;
}

function setSessionCookie(res, sessionId) {
  // HttpOnly session cookie; SameSite=Lax works for same-origin requests.
  res.setHeader("Set-Cookie", [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`,
  ]);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", [
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
  ]);
}

function createSession(res, userId) {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, userId);
  setSessionCookie(res, sessionId);
  saveStore();
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Resolve the logged-in user id from the session cookie (or null).
function currentUserId(req) {
  const jar = parseCookies(req);
  const sessionId = jar[SESSION_COOKIE];
  return (sessionId && sessions.get(sessionId)) || null;
}

// Build a daily summary from a user's completed-task log.
function wellnessSummary(userId) {
  const log = wellnessByUser.get(userId) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const todayLog = log.filter((e) => e.at.slice(0, 10) === today);
  return {
    total: log.length,
    today: todayLog.length,
    todayTasks: todayLog.map((e) => e.taskId),
    recent: log.slice(-20),
  };
}

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------
app.post("/api/auth/register", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (!name) {
    return res.status(400).json({ error: "Please tell us your name." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "That email address doesn't look right." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password needs at least 8 characters." });
  }
  if (usersByEmail.has(email)) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const { hash, salt } = hashPassword(password);
  const user = { id: crypto.randomUUID(), name, email, passwordHash: hash, salt };
  usersByEmail.set(email, user);
  usersById.set(user.id, publicUser(user));

  createSession(res, user.id); // persists users + session
  return res.status(201).json({ user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  const user = usersByEmail.get(email);
  if (!user) {
    return res.status(401).json({ error: "We couldn't find an account with those details." });
  }

  const { hash } = hashPassword(password, user.salt);
  if (!safeEqual(hash, user.passwordHash)) {
    return res.status(401).json({ error: "That password doesn't match. Please try again." });
  }

  createSession(res, user.id);
  return res.status(200).json({ user: publicUser(user) });
});

app.get("/api/auth/session", (req, res) => {
  const jar = parseCookies(req);
  const sessionId = jar[SESSION_COOKIE];
  const userId = sessionId && sessions.get(sessionId);
  const user = userId && usersById.get(userId);
  // Always 200. A missing session is a normal "logged out" state, not an error,
  // so we return { user: null } to avoid noisy 401s in the browser console.
  return res.status(200).json({ user: user || null });
});

app.post("/api/auth/logout", (req, res) => {
  const jar = parseCookies(req);
  const sessionId = jar[SESSION_COOKIE];
  if (sessionId) {
    sessions.delete(sessionId);
    saveStore();
  }
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
});

// ---------------------------------------------------------------------------
// Wellness monitoring routes (require a logged-in session)
//   GET  /api/wellness            -> { total, today, todayTasks, recent }
//   POST /api/wellness/complete   { taskId, label } -> records a completed task
// ---------------------------------------------------------------------------
app.get("/api/wellness", (req, res) => {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ error: "Please sign in first." });
  return res.status(200).json(wellnessSummary(userId));
});

app.post("/api/wellness/complete", (req, res) => {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ error: "Please sign in first." });

  const taskId = String(req.body?.taskId ?? "").trim();
  const label = String(req.body?.label ?? "").trim().slice(0, 120);
  if (!taskId) return res.status(400).json({ error: "Missing taskId." });

  const log = wellnessByUser.get(userId) ?? [];
  log.push({ taskId, label, at: new Date().toISOString() });
  wellnessByUser.set(userId, log);
  saveStore();

  return res.status(201).json(wellnessSummary(userId));
});

// ---------------------------------------------------------------------------
// Check-ins API (SQLite — per user, matches WellscapeUI contract)
//   GET    /api/checkins            -> all checkins for the logged-in user (ASC)
//   GET    /api/checkins/:id        -> single checkin (must belong to user)
//   POST   /api/checkins            { date, mood, sleep, water, activity, note }
//   PUT    /api/checkins/:id        { date, mood, sleep, water, activity, note }
//   DELETE /api/checkins/:id        -> { ok: true }
// ---------------------------------------------------------------------------
import { DatabaseSync } from "node:sqlite";

const CHECKINS_DB_PATH = path.join(DATA_DIR, "checkins.sqlite");

let db;
function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(CHECKINS_DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS checkins (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT    NOT NULL,
      date       TEXT    NOT NULL,
      mood       INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
      sleep      REAL    NOT NULL CHECK (sleep BETWEEN 0 AND 12),
      water      INTEGER NOT NULL CHECK (water BETWEEN 0 AND 16),
      activity   INTEGER NOT NULL CHECK (activity BETWEEN 0 AND 1440),
      note       TEXT    NOT NULL DEFAULT '',
      created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id);
  `);
  return db;
}

function isValidCheckin({ date, mood, sleep, water, activity, note }) {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00.000Z`) : null;
  const validDate = d && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
  return Boolean(
    validDate &&
    Number.isInteger(mood) && mood >= 1 && mood <= 5 &&
    Number.isFinite(sleep) && sleep >= 0 && sleep <= 12 && Number.isInteger(sleep * 2) &&
    Number.isInteger(water) && water >= 0 && water <= 16 &&
    Number.isInteger(activity) && activity >= 0 && activity <= 1440 &&
    typeof note === "string" && note.length <= 240
  );
}

// Middleware: require a session cookie; attaches userId to req.
function requireAuth(req, res, next) {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ error: "Please sign in first." });
  req.userId = userId;
  next();
}

app.get("/api/checkins", requireAuth, (req, res) => {
  const rows = getDb()
    .prepare("SELECT id,date,mood,sleep,water,activity,note FROM checkins WHERE user_id=? ORDER BY date ASC, id ASC")
    .all(req.userId);
  res.json(rows);
});

app.get("/api/checkins/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid ID." });
  const row = getDb()
    .prepare("SELECT id,date,mood,sleep,water,activity,note FROM checkins WHERE id=? AND user_id=?")
    .get(id, req.userId);
  if (!row) return res.status(404).json({ error: "Check-in not found." });
  res.json(row);
});

app.post("/api/checkins", requireAuth, (req, res) => {
  const body = req.body ?? {};
  const checkin = {
    date: String(body.date ?? ""),
    mood: Number(body.mood),
    sleep: Number(body.sleep),
    water: Number(body.water),
    activity: Number(body.activity),
    note: String(body.note ?? "").trim(),
  };
  if (!isValidCheckin(checkin)) return res.status(400).json({ error: "Invalid check-in data." });
  const result = getDb()
    .prepare("INSERT INTO checkins (user_id,date,mood,sleep,water,activity,note) VALUES (?,?,?,?,?,?,?)")
    .run(req.userId, checkin.date, checkin.mood, checkin.sleep, checkin.water, checkin.activity, checkin.note);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.put("/api/checkins/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid ID." });
  const exists = getDb()
    .prepare("SELECT id FROM checkins WHERE id=? AND user_id=?")
    .get(id, req.userId);
  if (!exists) return res.status(404).json({ error: "Check-in not found." });
  const body = req.body ?? {};
  const checkin = {
    date: String(body.date ?? ""),
    mood: Number(body.mood),
    sleep: Number(body.sleep),
    water: Number(body.water),
    activity: Number(body.activity),
    note: String(body.note ?? "").trim(),
  };
  if (!isValidCheckin(checkin)) return res.status(400).json({ error: "Invalid check-in data." });
  getDb()
    .prepare("UPDATE checkins SET date=?,mood=?,sleep=?,water=?,activity=?,note=? WHERE id=? AND user_id=?")
    .run(checkin.date, checkin.mood, checkin.sleep, checkin.water, checkin.activity, checkin.note, id, req.userId);
  res.json({ id });
});

app.delete("/api/checkins/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid ID." });
  getDb()
    .prepare("DELETE FROM checkins WHERE id=? AND user_id=?")
    .run(id, req.userId);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Static frontend
// ---------------------------------------------------------------------------
// Disable caching during development so edits to JS/CSS always show up without
// a manual hard-refresh (this project loads plain static files).
app.use(
  express.static(publicDir, {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store");
    },
  })
);

// SPA-style fallback to index.html for any non-API GET.
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

loadStore();

app.listen(PORT, () => {
  console.log(`\n🌿 Wellscape running at http://localhost:${PORT}\n`);
});
