const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const webpush = require("web-push");
require("dotenv").config();

const vapidPublic = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivate = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "";

if (vapidPublic && vapidPrivate && vapidSubject) {
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
}

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

// Add push_subscription column if it doesn't exist yet
try {
  db.exec(`ALTER TABLE users ADD COLUMN push_subscription TEXT NOT NULL DEFAULT ''`);
} catch {
  // Column already exists
}

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

// --- Push notification & reminder endpoints ---

app.get("/api/push/vapid-key", (req, res) => {
  res.json({ key: vapidPublic });
});

app.post("/api/push/subscribe", authRequired, (req, res) => {
  const subscription = req.body.subscription;
  if (!subscription || !subscription.endpoint) {
    res.status(400).json({ error: "Invalid push subscription." });
    return;
  }

  db.prepare(
    `UPDATE users SET push_subscription = ?, updated_at = ? WHERE id = ?`
  ).run(JSON.stringify(subscription), nowIso(), req.session.userId);

  res.json({ ok: true });
});

app.get("/api/reminders", authRequired, (req, res) => {
  const user = db
    .prepare(`SELECT reminder_enabled, reminder_time FROM users WHERE id = ?`)
    .get(req.session.userId);

  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  res.json({
    enabled: Boolean(user.reminder_enabled),
    time: user.reminder_time || "20:00",
  });
});

app.post("/api/reminders", authRequired, (req, res) => {
  const enabled = Boolean(req.body.enabled);
  const time = String(req.body.time || "20:00");

  if (!/^\d{2}:\d{2}$/.test(time)) {
    res.status(400).json({ error: "Invalid time format. Use HH:MM." });
    return;
  }

  db.prepare(
    `UPDATE users SET reminder_enabled = ?, reminder_time = ?, updated_at = ? WHERE id = ?`
  ).run(enabled ? 1 : 0, time, nowIso(), req.session.userId);

  res.json({ ok: true });
});

// Serve service worker with correct headers (no aggressive caching)
app.get("/service-worker.js", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Service-Worker-Allowed", "/");
  res.sendFile(path.join(__dirname, "service-worker.js"));
});

app.use(express.static(__dirname));

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// --- Push notification scheduler ---

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function minuteOfDay(value) {
  const [h, m] = String(value || "").split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function nowMinuteOfDay() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

async function processReminders() {
  if (!vapidPublic || !vapidPrivate) return;

  const users = db
    .prepare(
      `SELECT id, tracker_data, push_subscription,
              reminder_enabled, reminder_time, reminder_last_sent
       FROM users
       WHERE reminder_enabled = 1 AND push_subscription != ''`
    )
    .all();

  const today = todayKey();
  const currentMinute = nowMinuteOfDay();

  for (const user of users) {
    if (user.reminder_last_sent === today) continue;

    const scheduledMinute = minuteOfDay(user.reminder_time || "20:00");
    if (scheduledMinute === null || currentMinute < scheduledMinute) continue;

    let subscription;
    try {
      subscription = JSON.parse(user.push_subscription);
    } catch {
      continue;
    }

    let trackerData;
    try {
      trackerData = sanitizeTrackerData(JSON.parse(user.tracker_data));
    } catch {
      trackerData = { ...defaultTrackerData };
    }

    const body = trackerData.work
      ? `Log progress for: ${trackerData.work}`
      : "Open Freedom and write your daily reflection.";

    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: "Time for your daily reflection",
          body,
        })
      );

      db.prepare(
        `UPDATE users SET reminder_last_sent = ?, updated_at = ? WHERE id = ?`
      ).run(today, nowIso(), user.id);
    } catch (error) {
      console.error(`Push failed for user ${user.id}:`, error.message);
      if (error.statusCode === 410) {
        db.prepare(
          `UPDATE users SET push_subscription = '', reminder_enabled = 0, updated_at = ? WHERE id = ?`
        ).run(nowIso(), user.id);
      }
    }
  }
}

const reminderInterval = setInterval(() => {
  processReminders().catch((error) => {
    console.error("Reminder scheduler error:", error.message);
  });
}, 60 * 1000);

processReminders().catch((error) => {
  console.error("Initial reminder check failed:", error.message);
});

function shutdown() {
  clearInterval(reminderInterval);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
