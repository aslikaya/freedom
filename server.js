const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "tracker.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    tracker_data TEXT NOT NULL,
    reminder_enabled INTEGER NOT NULL DEFAULT 0,
    reminder_time TEXT NOT NULL DEFAULT '20:00',
    reminder_last_sent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const defaultTrackerData = {
  days: {},
  weeks: {},
  months: {},
  work: "",
};

app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 14,
    },
  })
);

function nowIso() {
  return new Date().toISOString();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeTrackerData(input) {
  const safeInput = input && typeof input === "object" ? input : {};
  return {
    days: safeInput.days && typeof safeInput.days === "object" ? safeInput.days : {},
    weeks: safeInput.weeks && typeof safeInput.weeks === "object" ? safeInput.weeks : {},
    months: safeInput.months && typeof safeInput.months === "object" ? safeInput.months : {},
    work: typeof safeInput.work === "string" ? safeInput.work : "",
  };
}

function getUserById(id) {
  return db
    .prepare(`SELECT id, email, tracker_data FROM users WHERE id = ?`)
    .get(id);
}

function authRequired(req, res, next) {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.post("/api/auth/register", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!validateEmail(email)) {
    res.status(400).json({ error: "Valid email is required." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    res.status(409).json({ error: "Email already registered." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const ts = nowIso();
  const data = JSON.stringify(defaultTrackerData);

  const result = db
    .prepare(
      `INSERT INTO users (email, password_hash, tracker_data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(email, passwordHash, data, ts, ts);

  req.session.userId = result.lastInsertRowid;
  res.json({ ok: true, user: { email } });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email);
  if (!user) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  req.session.userId = user.id;
  res.json({ ok: true, user: { email: user.email } });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) {
    res.json({ authenticated: false });
    return;
  }
  const user = db.prepare("SELECT email FROM users WHERE id = ?").get(req.session.userId);
  if (!user) {
    req.session.userId = null;
    res.json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, user: { email: user.email } });
});

app.get("/api/tracker", authRequired, (req, res) => {
  const user = getUserById(req.session.userId);
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  let trackerData = defaultTrackerData;
  try {
    trackerData = sanitizeTrackerData(JSON.parse(user.tracker_data));
  } catch {
    trackerData = { ...defaultTrackerData };
  }

  res.json({ trackerData });
});

app.post("/api/tracker", authRequired, (req, res) => {
  const incoming = sanitizeTrackerData(req.body.trackerData);
  const ts = nowIso();

  db.prepare(
    `UPDATE users
     SET tracker_data = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(
    JSON.stringify(incoming),
    ts,
    req.session.userId
  );

  res.json({ ok: true });
});

app.use(express.static(__dirname));

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
