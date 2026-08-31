const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const axios = require("axios");
const session = require("express-session");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

dotenv.config();

const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST;
const APP_NAME = process.env.APP_NAME || "Fitness Buddy";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 7);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "liquid/lfm-2.5-1.2b-instruct:free";
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "db.sqlite");

const usePostgres = !!process.env.DATABASE_URL;
let pool = null;
if (usePostgres) {
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProd ? { rejectUnauthorized: false } : false
  });
}

if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.trim().length < 32)) {
  console.error("FATAL: SESSION_SECRET environment variable must be set and be at least 32 characters when NODE_ENV=production.");
  process.exit(1);
}

function parseAllowedOrigins(value) {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || APP_URL);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || !isProd || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS."));
  },
  credentials: true,
};

const app = express();
if (isProd) app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProd) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "10mb" }));

let sqliteDb = null;
if (!usePostgres) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  sqliteDb = new sqlite3.Database(DB_PATH);
}

const db = {
  run(sql, params = [], callback) {
    if (typeof params === "function") {
      callback = params;
      params = [];
    }
    if (usePostgres) {
      let pgSql = sql;
      let count = 1;
      while (pgSql.includes("?")) {
        pgSql = pgSql.replace("?", `$${count++}`);
      }
      if (pgSql.toUpperCase().startsWith("PRAGMA")) {
        if (callback) callback(null);
        return;
      }
      pgSql = pgSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, "SERIAL PRIMARY KEY");
      pgSql = pgSql.replace(/timestamp INTEGER/gi, "timestamp BIGINT");
      pgSql = pgSql.replace(/expired INTEGER/gi, "expired BIGINT");
      pgSql = pgSql.replace(/expires_at INTEGER/gi, "expires_at BIGINT");
      pgSql = pgSql.replace(/used_at INTEGER/gi, "used_at BIGINT");
      pgSql = pgSql.replace(/created_at INTEGER/gi, "created_at BIGINT");
      
      if (pgSql.toUpperCase().startsWith("ALTER TABLE")) {
        pool.query(pgSql, params)
          .then(() => callback && callback(null))
          .catch(() => callback && callback(null));
        return;
      }
      pool.query(pgSql, params)
        .then(res => {
          if (callback) {
            const ctx = {
              lastID: res.rows?.[0]?.id || null,
              changes: res.rowCount
            };
            callback.call(ctx, null);
          }
        })
        .catch(err => {
          if (callback) callback(err);
        });
    } else {
      sqliteDb.run(sql, params, callback || function(err) {
        if (err) console.error("SQLite run error:", err.message);
      });
    }
  },

  get(sql, params = [], callback) {
    if (typeof params === "function") {
      callback = params;
      params = [];
    }
    if (usePostgres) {
      let pgSql = sql;
      let count = 1;
      while (pgSql.includes("?")) {
        pgSql = pgSql.replace("?", `$${count++}`);
      }
      pool.query(pgSql, params)
        .then(res => {
          if (callback) callback(null, res.rows[0] || null);
        })
        .catch(err => {
          if (callback) callback(err, null);
        });
    } else {
      sqliteDb.get(sql, params, callback);
    }
  },

  all(sql, params = [], callback) {
    if (typeof params === "function") {
      callback = params;
      params = [];
    }
    if (usePostgres) {
      let pgSql = sql;
      let count = 1;
      while (pgSql.includes("?")) {
        pgSql = pgSql.replace("?", `$${count++}`);
      }
      pool.query(pgSql, params)
        .then(res => {
          if (callback) callback(null, res.rows || []);
        })
        .catch(err => {
          if (callback) callback(err, []);
        });
    } else {
      sqliteDb.all(sql, params, callback);
    }
  },

  serialize(callback) {
    if (usePostgres) {
      callback();
    } else {
      sqliteDb.serialize(callback);
    }
  },

  close(callback) {
    if (usePostgres) {
      pool.end(callback);
    } else {
      sqliteDb.close(callback);
    }
  }
};

function importIndianFoodDataset() {
  const csvPath = path.join(__dirname, "Indian_Food_Nutrition_Processed.csv");
  if (!fs.existsSync(csvPath)) {
    console.log("Indian food dataset CSV not found at", csvPath);
    return;
  }

  db.get("SELECT COUNT(*) as count FROM food_dataset", (err, row) => {
    if (err) {
      console.error("Error checking food dataset size:", err);
      return;
    }
    if (row && row.count > 0) {
      console.log(`Indian food dataset already loaded (${row.count} items).`);
      return;
    }

    console.log("Importing Indian food dataset from CSV...");
    try {
      const content = fs.readFileSync(csvPath, "utf-8");
      const lines = content.split(/\r?\n/);
      
      let importCount = 0;
      
      // Helper to parse CSV line respecting quotes
      function parseCSVLine(line) {
        const result = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = "";
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      }
      
      db.serialize(() => {
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const fields = parseCSVLine(line);
          if (fields.length < 5) continue;
          
          const name = fields[0].replace(/"/g, "").trim();
          const calories = parseFloat(fields[1]) || 0;
          const carbs = parseFloat(fields[2]) || 0;
          const protein = parseFloat(fields[3]) || 0;
          const fat = parseFloat(fields[4]) || 0;
          
          if (!name) continue;
          
          db.run(
            `INSERT INTO food_dataset (name, calories, carbs, protein, fat)
             VALUES (?, ?, ?, ?, ?)`,
            [name, calories, carbs, protein, fat]
          );
          importCount++;
        }
      });
      
      console.log(`Successfully imported ${importCount} dishes to the food dataset!`);
    } catch (e) {
      console.error("Failed to import Indian food CSV:", e);
    }
  });
}

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA journal_mode = WAL");
  db.run(
    `CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expired INTEGER NOT NULL
    )`
  );
  db.run("CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired)");
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INTEGER PRIMARY KEY,
      name TEXT,
      weight REAL,
      height REAL,
      age INTEGER,
      gender TEXT,
      goal TEXT,
      goal_protein REAL,
      goal_carbs REAL,
      goal_fat REAL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );
  db.run("ALTER TABLE user_profiles ADD COLUMN name TEXT", () => {});
  db.run(
    `CREATE TABLE IF NOT EXISTS daily_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      water_intake INTEGER DEFAULT 0,
      steps_count INTEGER DEFAULT 0,
      active_minutes INTEGER DEFAULT 0,
      weight REAL,
      UNIQUE(user_id, date),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS activities_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      calories REAL NOT NULL,
      protein REAL DEFAULT 0,
      carbs REAL DEFAULT 0,
      fat REAL DEFAULT 0,
      date TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      meal_type TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS custom_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      calories REAL NOT NULL,
      protein REAL DEFAULT 0,
      carbs REAL DEFAULT 0,
      fat REAL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  db.run("CREATE INDEX IF NOT EXISTS idx_activities_user_date ON activities_log(user_id, date)");
  db.run("CREATE INDEX IF NOT EXISTS idx_metrics_user_date ON daily_metrics(user_id, date)");
  db.run("CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_history(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_catalog_user ON custom_catalog(user_id)");

  // Migrations for meal_type column
  db.run("ALTER TABLE activities_log ADD COLUMN meal_type TEXT", (err) => {
    // Ignore error if column already exists
  });

  // Global food dataset table for imported CSV values
  db.run(
    `CREATE TABLE IF NOT EXISTS food_dataset (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      calories REAL NOT NULL,
      carbs REAL DEFAULT 0,
      protein REAL DEFAULT 0,
      fat REAL DEFAULT 0
    )`
  );
  db.run("CREATE INDEX IF NOT EXISTS idx_food_dataset_name ON food_dataset(name)");

  // Run CSV dataset import
  importIndianFoodDataset();
});

class SQLiteSessionStore extends session.Store {
  get(sid, callback) {
    db.get("SELECT sess, expired FROM sessions WHERE sid = ?", [sid], (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(null, null);
      if (row.expired <= Date.now()) {
        return this.destroy(sid, (destroyErr) => callback(destroyErr, null));
      }
      try {
        return callback(null, JSON.parse(row.sess));
      } catch (parseErr) {
        return callback(parseErr);
      }
    });
  }

  set(sid, sess, callback) {
    const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + SESSION_TTL_MS;
    db.run(
      `INSERT INTO sessions (sid, sess, expired)
       VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired = excluded.expired`,
      [sid, JSON.stringify(sess), expires],
      callback
    );
  }

  destroy(sid, callback) {
    db.run("DELETE FROM sessions WHERE sid = ?", [sid], callback);
  }

  touch(sid, sess, callback) {
    const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + SESSION_TTL_MS;
    db.run("UPDATE sessions SET expired = ? WHERE sid = ?", [expires, sid], callback);
  }
}

setInterval(() => {
  db.run("DELETE FROM sessions WHERE expired <= ?", [Date.now()]);
}, 1000 * 60 * 60).unref();

app.use(
  session({
    name: "fb.sid",
    secret: SESSION_SECRET || "dev-secret-change-me-please-set-session-secret",
    store: new SQLiteSessionStore(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_TTL_MS,
    },
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

const authSensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

app.use("/api/auth", authLimiter);
app.use("/api/auth/login", authSensitiveLimiter);
app.use("/api/auth/register", authSensitiveLimiter);
app.use("/api/auth/forgot-password", authSensitiveLimiter);
app.use("/api/auth/reset-password", authSensitiveLimiter);

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many chat requests. Please try again later." },
});

app.use("/api/chat", chatLimiter);

app.use(express.static(path.join(__dirname, "public"), {
  index: false,
  maxAge: isProd ? "1h" : 0,
}));

app.get("/healthz", (_req, res) => {
  db.get("SELECT 1 AS ok", (err) => {
    if (err) return res.status(503).json({ ok: false });
    return res.json({ ok: true, app: APP_NAME });
  });
});

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: "Unauthorized" });
}

function requireAuthPage(req, res, next) {
  if (req.session?.userId) return next();
  return res.redirect("/login.html");
}

function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function validateNewPassword(password) {
  const pw = String(password || "");
  if (pw.length < 8) return "Password must be at least 8 characters.";
  return null;
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) return res.status(400).json({ error: "Invalid email." });
    const pwErr = validateNewPassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const passwordHash = await bcrypt.hash(password, 12);
    const createdAt = Date.now();

    db.run(
      "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
      [email, passwordHash, createdAt],
      function (err) {
        if (err) {
          if (String(err.message || "").includes("UNIQUE")) {
            return res.status(409).json({ error: "Email already registered." });
          }
          console.error("Register error:", err);
          return res.status(500).json({ error: "Server error." });
        }
        req.session.userId = this.lastID;
        req.session.email = email;
        return res.json({ user: { id: this.lastID, email } });
      }
    );
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ error: "Server error." });
  }
});

app.post("/api/auth/login", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) return res.status(400).json({ error: "Invalid email." });
  if (!password) return res.status(400).json({ error: "Password is required." });

  db.get("SELECT id, email, password_hash FROM users WHERE email = ?", [email], async (err, row) => {
    if (err) {
      console.error("Login error:", err);
      return res.status(500).json({ error: "Server error." });
    }
    if (!row) return res.status(401).json({ error: "Invalid email or password." });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password." });

    req.session.userId = row.id;
    req.session.email = row.email;
    return res.json({ user: { id: row.id, email: row.email } });
  });
});

app.post("/api/auth/forgot-password", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) return res.status(400).json({ error: "Invalid email." });

  db.get("SELECT id, email FROM users WHERE email = ?", [email], (err, row) => {
    if (err) {
      console.error("Forgot password error:", err);
      return res.status(500).json({ error: "Server error." });
    }

    // Always return ok to avoid user enumeration
    if (!row) return res.json({ ok: true });

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(token);
    const now = Date.now();
    const expiresAt = now + 1000 * 60 * 20; // 20 minutes

    db.run(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)",
      [row.id, tokenHash, expiresAt, now],
      (insErr) => {
        if (insErr) {
          console.error("Forgot password insert error:", insErr);
          return res.status(500).json({ error: "Server error." });
        }

        const payload = { ok: true };
        if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
          payload.resetLink = `/reset-password.html?token=${token}`;
        }
        return res.json(payload);
      }
    );
  });
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const token = String(req.body?.token || "");
    const newPassword = String(req.body?.newPassword || "");
    if (!token) return res.status(400).json({ error: "Token is required." });
    const pwErr = validateNewPassword(newPassword);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const tokenHash = sha256Hex(token);
    const now = Date.now();

    db.get(
      "SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?",
      [tokenHash],
      async (err, row) => {
        if (err) {
          console.error("Reset password lookup error:", err);
          return res.status(500).json({ error: "Server error." });
        }
        if (!row) return res.status(400).json({ error: "Invalid or expired token." });
        if (row.used_at) return res.status(400).json({ error: "Token already used." });
        if (row.expires_at < now) return res.status(400).json({ error: "Invalid or expired token." });

        const passwordHash = await bcrypt.hash(newPassword, 12);
        db.run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, row.user_id], (uErr) => {
          if (uErr) {
            console.error("Reset password update error:", uErr);
            return res.status(500).json({ error: "Server error." });
          }
          db.run("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?", [now, row.id]);
          return res.json({ ok: true });
        });
      }
    );
  } catch (e) {
    console.error("Reset password error:", e);
    return res.status(500).json({ error: "Server error." });
  }
});

app.post("/api/auth/change-password", requireAuth, (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  const pwErr = validateNewPassword(newPassword);
  if (pwErr) return res.status(400).json({ error: pwErr });

  const userId = req.session.userId;
  db.get("SELECT id, password_hash FROM users WHERE id = ?", [userId], async (err, row) => {
    if (err) {
      console.error("Change password error:", err);
      return res.status(500).json({ error: "Server error." });
    }
    if (!row) return res.status(401).json({ error: "Unauthorized" });

    const ok = await bcrypt.compare(currentPassword, row.password_hash);
    if (!ok) return res.status(400).json({ error: "Current password is incorrect." });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    db.run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId], (uErr) => {
      if (uErr) {
        console.error("Change password update error:", uErr);
        return res.status(500).json({ error: "Server error." });
      }
      return res.json({ ok: true });
    });
  });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("fb.sid");
    res.json({ ok: true });
  });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ user: null });
  res.json({ user: { id: req.session.userId, email: req.session.email } });
});

app.post("/api/chat", requireAuth, async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    console.log(`[Chatbox] Incoming message: "${message}" from session user:`, req.session?.userId);
    if (!message) return res.status(400).json({ error: "Message is required." });
    if (message.length > 1000) return res.status(400).json({ error: "Message is too long." });

    const userId = req.session.userId;

    // Get user profile first to construct context-rich prompt
    db.get("SELECT * FROM user_profiles WHERE user_id = ?", [userId], (err, profile) => {
      if (err) {
        console.error("DB error fetching profile for chat:", err);
      }

      // Fetch last 5 messages from chat history to pass conversation history context
      db.all(
        "SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY timestamp DESC LIMIT 5",
        [userId],
        async (errHist, historyRows) => {
          if (errHist) {
            console.error("DB error fetching chat history:", errHist);
          }

          // Reverse history to chronological order
          const history = (historyRows || []).reverse().map(h => ({
            role: h.role,
            content: h.content
          }));

          // Determine key & provider details
          let provider = "openrouter";
          let apiKey = OPENROUTER_API_KEY;
          let model = OPENROUTER_MODEL || "liquid/lfm-2.5-1.2b-instruct:free";

          if (req.body.customApiKey) {
            provider = req.body.customProvider || "gemini";
            apiKey = req.body.customApiKey;
            if (req.body.customModel) {
              model = req.body.customModel;
            } else {
              model = "";
            }
          }

          if (!apiKey) {
            return res.status(503).json({ error: "AI key is not configured." });
          }

          // User stats
          const name = profile?.name || "User";
          const weight = profile?.weight || "not set";
          const height = profile?.height || "not set";
          const age = profile?.age || "not set";
          const gender = profile?.gender || "not set";
          const goal = profile?.goal || "maintain";

          let bmr = "not set";
          if (typeof weight === 'number' && typeof height === 'number' && typeof age === 'number' && gender) {
            if (gender === 'male') {
              bmr = 10 * weight + 6.25 * height - 5 * age + 5;
            } else {
              bmr = 10 * weight + 6.25 * height - 5 * age - 161;
            }
          }

          // Live tracker state
          const tracker = req.body.trackerState || {};
          const foodTotal = tracker.foodTotal || 0;
          const exerciseTotal = tracker.exerciseTotal || 0;
          const calorieGoal = tracker.calorieGoal || 2000;
          const waterIntake = tracker.waterIntake || 0;
          const stepsCount = tracker.stepsCount || 0;
          const activeMinutes = tracker.activeMinutes || 0;
          const totalProtein = tracker.totalProtein || 0;
          const totalCarbs = tracker.totalCarbs || 0;
          const totalFat = tracker.totalFat || 0;
          const macroGoals = tracker.macroGoals || { protein: 100, carbs: 250, fat: 70 };

          const activities = tracker.activities || [];
          const meals = activities.filter(a => a.type === 'food').map(a => `${a.meal_type || 'Meal'}: ${a.description} (${Math.round(a.calories)} kcal, P: ${Math.round(a.protein || 0)}g, C: ${Math.round(a.carbs || 0)}g, F: ${Math.round(a.fat || 0)}g)`).join("; ");
          const workouts = activities.filter(a => a.type === 'exercise').map(a => `${a.description} (${Math.round(a.calories)} kcal burned)`).join("; ");

          const systemPrompt = `You are Fitness Buddy's premium AI Health Coach.
You have real-time access to the user's details and active tracker logs for today:
User Profile:
- Name: ${name}
- Gender: ${gender}
- Age: ${age} years
- Weight: ${weight} kg
- Height: ${height} cm
- BMR: ${bmr} kcal
- Goal: ${goal}
- Calorie Target: ${calorieGoal} kcal
- Macro Targets: Protein: ${macroGoals.protein}g, Carbs: ${macroGoals.carbs}g, Fat: ${macroGoals.fat}g

Today's Progress:
- Calories Consumed: ${Math.round(foodTotal)} kcal
- Calories Burned: ${Math.round(exerciseTotal)} kcal
- Water Intake: ${waterIntake} ml / 2000 ml
- Steps: ${stepsCount} / 10000 steps
- Active Minutes: ${activeMinutes} mins
- Today's Meal Logs: ${meals || "None logged yet"}
- Today's Workout Logs: ${workouts || "None logged yet"}

Instructions:
1. Provide highly personalized, accurate, friendly health advice matching the user's stats and progress.
2. If they ask about their progress, calorie count, macros, steps, or water, give them precise metrics using the stats above.
3. Focus on nutrition, exercise, and sustainable progress. Keep responses short, encouraging, and clear.
4. Warn the user if they have exceeded any daily macro/calorie goals.`;

          let reply = "";

          try {
            if (provider === "gemini") {
              const historyText = history.map(h => `${h.role === 'user' ? 'User' : 'Coach'}: ${h.content}`).join("\n");
              const fullPrompt = `${systemPrompt}\n\nConversation History:\n${historyText}\n\nUser Message: ${message}\nCoach:`;

              const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
                {
                  contents: [
                    {
                      parts: [{ text: fullPrompt }]
                    }
                  ],
                  generationConfig: {
                    maxOutputTokens: 250,
                    temperature: 0.7
                  }
                },
                { timeout: 15000 }
              );
              reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            } else if (provider === "openai") {
              const response = await axios.post(
                "https://api.openai.com/v1/chat/completions",
                {
                  model: model || "gpt-4o-mini",
                  messages: [
                    { role: "system", content: systemPrompt },
                    ...history,
                    { role: "user", content: message }
                  ],
                  max_tokens: 250,
                  temperature: 0.7
                },
                {
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                  },
                  timeout: 15000
                }
              );
              reply = response.data?.choices?.[0]?.message?.content;
            } else {
              // openrouter
              const response = await axios.post(
                "https://openrouter.ai/api/v1/chat/completions",
                {
                  model: model || "liquid/lfm-2.5-1.2b-instruct:free",
                  messages: [
                    { role: "system", content: systemPrompt },
                    ...history,
                    { role: "user", content: message }
                  ],
                  max_tokens: 250,
                  temperature: 0.7
                },
                {
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": APP_URL,
                    "X-Title": `${APP_NAME} Chat`
                  },
                  timeout: 15000
                }
              );
              reply = response.data?.choices?.[0]?.message?.content;
            }

            if (!reply) {
              return res.status(502).json({ error: "AI provider returned an empty response." });
            }

            reply = reply.trim();

            // Save both user query and assistant reply to DB
            const now = Date.now();
            db.serialize(() => {
              db.run("INSERT INTO chat_history (user_id, role, content, timestamp) VALUES (?, 'user', ?, ?)", [userId, message, now - 1]);
              db.run("INSERT INTO chat_history (user_id, role, content, timestamp) VALUES (?, 'assistant', ?, ?)", [userId, reply, now]);
            });

            res.json({ reply });
          } catch (apiErr) {
            console.error(`${provider} API call error:`, apiErr.response?.data || apiErr.message);
            res.status(503).json({ error: `AI service (${provider}) error or invalid key.` });
          }
        }
      );
    });
  } catch (error) {
    console.error("Chat endpoint error:", error.message || error);
    res.status(503).json({ error: "AI chat service is temporarily unavailable." });
  }
});

app.post("/api/vision", requireAuth, async (req, res) => {
  try {
    const base64Image = req.body?.image;
    if (!base64Image) return res.status(400).json({ error: "Image is required." });

    let provider = "openrouter";
    let apiKey = OPENROUTER_API_KEY;
    let model = OPENROUTER_MODEL || "nvidia/nemotron-nano-12b-v2-vl:free";
    if (model === "openrouter/free" || model === "liquid/lfm-2.5-1.2b-instruct:free") {
      model = "nvidia/nemotron-nano-12b-v2-vl:free";
    }
    
    if (req.body.customApiKey) {
      provider = req.body.customProvider || "gemini";
      apiKey = req.body.customApiKey;
    }

    if (!apiKey) {
      return res.status(503).json({ error: "AI key is not configured. Please add one in settings." });
    }

    let apiBase = "https://openrouter.ai/api/v1/chat/completions";
    let headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };

    let payload = {
      model: model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this image of food. Identify what it is and estimate its nutritional value per serving. Respond ONLY with a valid JSON object matching this exact format, with no markdown formatting or other text: {\"foodKey\":\"name_of_food\",\"calories\":100,\"protein\":10,\"carbs\":20,\"fat\":5,\"confidence\":0.9}"
            },
            {
              type: "image_url",
              image_url: {
                url: base64Image
              }
            }
          ]
        }
      ]
    };

    if (provider === "gemini") {
      apiBase = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      headers = { "Content-Type": "application/json" };
      const mimeMatch = base64Image.match(/^data:(image\/\w+);base64,(.*)$/);
      if (mimeMatch) {
         payload = {
           contents: [{
             parts: [
               { text: "Analyze this image of food. Identify what it is and estimate its nutritional value per serving. Respond ONLY with a valid JSON object matching this exact format, with no markdown formatting or other text: {\"foodKey\":\"name_of_food\",\"calories\":100,\"protein\":10,\"carbs\":20,\"fat\":5,\"confidence\":0.9}" },
               {
                 inline_data: {
                   mime_type: mimeMatch[1],
                   data: mimeMatch[2]
                 }
               }
             ]
           }]
         };
      }
    } else if (provider === "openai") {
      apiBase = "https://api.openai.com/v1/chat/completions";
      payload.model = "gpt-4o-mini";
    }

    const response = await axios.post(apiBase, payload, { headers });
    
    let aiText = "";
    if (provider === "gemini") {
      aiText = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    } else {
      aiText = response.data.choices?.[0]?.message?.content || "{}";
    }

    aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
    const data = JSON.parse(aiText);
    
    res.json(data);
  } catch (error) {
    console.error("Vision API error:", error.response?.data || error.message);
    res.status(503).json({ error: "Vision AI service failed." });
  }
});

// Profile endpoints
app.get("/api/profile", requireAuth, (req, res) => {
  const userId = req.session.userId;
  db.get("SELECT * FROM user_profiles WHERE user_id = ?", [userId], (err, row) => {
    if (err) {
      console.error("Fetch profile error:", err);
      return res.status(500).json({ error: "Server error." });
    }
    return res.json({ profile: row || null });
  });
});

app.post("/api/profile", requireAuth, (req, res) => {
  const userId = req.session.userId;
  const { name, weight, height, age, gender, goal, goal_protein, goal_carbs, goal_fat } = req.body;
  db.run(
    `INSERT INTO user_profiles (user_id, name, weight, height, age, gender, goal, goal_protein, goal_carbs, goal_fat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       name = excluded.name,
       weight = excluded.weight,
       height = excluded.height,
       age = excluded.age,
       gender = excluded.gender,
       goal = excluded.goal,
       goal_protein = excluded.goal_protein,
       goal_carbs = excluded.goal_carbs,
       goal_fat = excluded.goal_fat`,
    [userId, name, weight, height, age, gender, goal, goal_protein, goal_carbs, goal_fat],
    (err) => {
      if (err) {
        console.error("Save profile error:", err);
        return res.status(500).json({ error: "Server error." });
      }
      return res.json({ ok: true });
    }
  );
});

// Daily metrics endpoints
app.get("/api/metrics/:date", requireAuth, (req, res) => {
  const userId = req.session.userId;
  const date = req.params.date;
  db.get("SELECT * FROM daily_metrics WHERE user_id = ? AND date = ?", [userId, date], (err, row) => {
    if (err) {
      console.error("Fetch metrics error:", err);
      return res.status(500).json({ error: "Server error." });
    }
    return res.json({
      metrics: row || { water_intake: 0, steps_count: 0, active_minutes: 0, weight: null }
    });
  });
});

app.post("/api/metrics/:date", requireAuth, (req, res) => {
  const userId = req.session.userId;
  const date = req.params.date;
  const { water_intake, steps_count, active_minutes, weight } = req.body;
  db.run(
    `INSERT INTO daily_metrics (user_id, date, water_intake, steps_count, active_minutes, weight)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET
       water_intake = COALESCE(excluded.water_intake, water_intake),
       steps_count = COALESCE(excluded.steps_count, steps_count),
       active_minutes = COALESCE(excluded.active_minutes, active_minutes),
       weight = COALESCE(excluded.weight, weight)`,
    [userId, date, water_intake, steps_count, active_minutes, weight],
    (err) => {
      if (err) {
        console.error("Save metrics error:", err);
        return res.status(500).json({ error: "Server error." });
      }
      return res.json({ ok: true });
    }
  );
});

// Logged activities endpoints
app.get("/api/activities/:date", requireAuth, (req, res) => {
  const userId = req.session.userId;
  const date = req.params.date;
  db.all(
    "SELECT * FROM activities_log WHERE user_id = ? AND date = ? ORDER BY timestamp ASC",
    [userId, date],
    (err, rows) => {
      if (err) {
        console.error("Fetch activities error:", err);
        return res.status(500).json({ error: "Server error." });
      }
      return res.json({ activities: rows || [] });
    }
  );
});

app.post("/api/activities", requireAuth, (req, res) => {
  const userId = req.session.userId;
  const { type, description, calories, protein, carbs, fat, date, meal_type } = req.body;
  const timestamp = Date.now();
  db.run(
    `INSERT INTO activities_log (user_id, type, description, calories, protein, carbs, fat, date, timestamp, meal_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, type, description, calories, protein || 0, carbs || 0, fat || 0, date, timestamp, meal_type || null],
    function (err) {
      if (err) {
        console.error("Insert activity error:", err);
        return res.status(500).json({ error: "Server error." });
      }
      return res.json({
        activity: {
          id: this.lastID,
          user_id: userId,
          type,
          description,
          calories,
          protein: protein || 0,
          carbs: carbs || 0,
          fat: fat || 0,
          date,
          timestamp,
          meal_type
        }
      });
    }
  );
});

app.delete("/api/activities/:id", requireAuth, (req, res) => {
  const userId = req.session.userId;
  const id = req.params.id;
  db.run("DELETE FROM activities_log WHERE id = ? AND user_id = ?", [id, userId], function (err) {
    if (err) {
      console.error("Delete activity error:", err);
      return res.status(500).json({ error: "Server error." });
    }
    return res.json({ ok: true, deletedCount: this.changes });
  });
});

// Chat history endpoints
app.get("/api/chat/history", requireAuth, (req, res) => {
  const userId = req.session.userId;
  db.all(
    "SELECT role, content, timestamp FROM chat_history WHERE user_id = ? ORDER BY timestamp ASC",
    [userId],
    (err, rows) => {
      if (err) {
        console.error("Fetch chat history error:", err);
        return res.status(500).json({ error: "Server error." });
      }
      return res.json({ history: rows || [] });
    }
  );
});

app.post("/api/chat/history", requireAuth, (req, res) => {
  const userId = req.session.userId;
  const { role, content } = req.body;
  if (!role || !content) return res.status(400).json({ error: "Role and content required." });
  const timestamp = Date.now();
  db.run(
    "INSERT INTO chat_history (user_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
    [userId, role, content, timestamp],
    (err) => {
      if (err) {
        console.error("Save chat message error:", err);
        return res.status(500).json({ error: "Server error." });
      }
      return res.json({ ok: true });
    }
  );
});

// Search Indian Food Dataset and User Custom Catalog
app.get("/api/food/search", requireAuth, (req, res) => {
  const userId = req.session.userId;
  const q = (req.query.q || "").trim();
  if (!q) {
    return res.json({ results: [] });
  }
  const searchPattern = `%${q.toLowerCase()}%`;

  db.all(
    "SELECT id, name, calories, protein, carbs, fat, 'custom' as origin FROM custom_catalog WHERE user_id = ? AND type = 'food' AND LOWER(name) LIKE ?",
    [userId, searchPattern],
    (err, customRows) => {
      if (err) {
        console.error("Search custom catalog error:", err);
        return res.status(500).json({ error: "Server error during search." });
      }

      db.all(
        "SELECT id, name, calories, protein, carbs, fat, 'global' as origin FROM food_dataset WHERE LOWER(name) LIKE ?",
        [searchPattern],
        (err, globalRows) => {
          if (err) {
            console.error("Search food dataset error:", err);
            return res.status(500).json({ error: "Server error during search." });
          }

          const merged = [...(customRows || []), ...(globalRows || [])];
          return res.json({ results: merged.slice(0, 10) });
        }
      );
    }
  );
});

// Custom foods/exercises catalog endpoints
app.get("/api/catalog", requireAuth, (req, res) => {
  const userId = req.session.userId;
  db.all("SELECT * FROM custom_catalog WHERE user_id = ?", [userId], (err, rows) => {
    if (err) {
      console.error("Fetch catalog error:", err);
      return res.status(500).json({ error: "Server error." });
    }
    return res.json({ catalog: rows || [] });
  });
});

app.post("/api/catalog", requireAuth, (req, res) => {
  const userId = req.session.userId;
  const { type, name, calories, protein, carbs, fat } = req.body;
  if (!type || !name || isNaN(calories)) {
    return res.status(400).json({ error: "Invalid catalog details." });
  }
  db.run(
    `INSERT INTO custom_catalog (user_id, type, name, calories, protein, carbs, fat)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, type, name, calories, protein || 0, carbs || 0, fat || 0],
    function (err) {
      if (err) {
        console.error("Insert catalog error:", err);
        return res.status(500).json({ error: "Server error." });
      }
      return res.json({
        item: {
          id: this.lastID,
          user_id: userId,
          type,
          name,
          calories,
          protein: protein || 0,
          carbs: carbs || 0,
          fat: fat || 0
        }
      });
    }
  );
});

app.delete("/api/catalog/:id", requireAuth, (req, res) => {
  const userId = req.session.userId;
  const id = req.params.id;
  db.run("DELETE FROM custom_catalog WHERE id = ? AND user_id = ?", [id, userId], function (err) {
    if (err) {
      console.error("Delete catalog error:", err);
      return res.status(500).json({ error: "Server error." });
    }
    return res.json({ ok: true, deletedCount: this ? this.changes : 1 });
  });
});


// Analytics endpoint
app.get("/api/analytics", requireAuth, (req, res) => {
  const userId = req.session.userId;
  const refDateStr = req.query.date || new Date().toLocaleDateString("en-CA");
  const refDate = new Date(refDateStr);

  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(refDate);
    d.setDate(refDate.getDate() - i);
    dates.push(d.toLocaleDateString("en-CA"));
  }

  const placeholders = dates.map(() => "?").join(",");
  const metricsQuery = `SELECT * FROM daily_metrics WHERE user_id = ? AND date IN (${placeholders})`;

  db.all(metricsQuery, [userId, ...dates], (err, metricsRows) => {
    if (err) {
      console.error("Analytics metrics error:", err);
      return res.status(500).json({ error: "Server error." });
    }

    const activitiesQuery = `
      SELECT date, type, SUM(calories) as total_cals
      FROM activities_log
      WHERE user_id = ? AND date IN (${placeholders})
      GROUP BY date, type
    `;
    db.all(activitiesQuery, [userId, ...dates], (err, actRows) => {
      if (err) {
        console.error("Analytics activities error:", err);
        return res.status(500).json({ error: "Server error." });
      }

      const metricsMap = {};
      metricsRows.forEach((row) => {
        metricsMap[row.date] = row;
      });

      const caloriesMap = {};
      actRows.forEach((row) => {
        if (!caloriesMap[row.date]) {
          caloriesMap[row.date] = { eaten: 0, burned: 0 };
        }
        if (row.type === "food") {
          caloriesMap[row.date].eaten += Math.abs(row.total_cals);
        } else if (row.type === "exercise") {
          caloriesMap[row.date].burned += Math.abs(row.total_cals);
        }
      });

      const result = {
        dates,
        steps: [],
        water: [],
        caloriesEaten: [],
        caloriesBurned: [],
        weight: []
      };

      dates.forEach((d) => {
        const m = metricsMap[d] || { steps_count: 0, water_intake: 0, weight: null };
        const c = caloriesMap[d] || { eaten: 0, burned: 0 };
        result.steps.push(m.steps_count || 0);
        result.water.push(m.water_intake || 0);
        result.caloriesEaten.push(Math.round(c.eaten));
        result.caloriesBurned.push(Math.round(c.burned));
        result.weight.push(m.weight || null);
      });

      return res.json(result);
    });
  });
});

// Streaks calculation helper
function getLoggingStreak(userId, callback) {
  const sql = `
    SELECT DISTINCT date FROM (
      SELECT date FROM activities_log WHERE user_id = ?
      UNION
      SELECT date FROM daily_metrics WHERE user_id = ? AND (steps_count > 0 OR water_intake > 0)
    ) ORDER BY date DESC
  `;
  db.all(sql, [userId, userId], (err, rows) => {
    if (err) return callback(err, 0);
    if (!rows || rows.length === 0) return callback(null, 0);

    const dates = rows.map(r => r.date);
    const todayStr = new Date().toLocaleDateString("en-CA");
    const yesterdayStr = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");

    let streak = 0;
    let expectedDate = new Date();
    
    if (dates.includes(todayStr)) {
      streak = 1;
      expectedDate.setDate(expectedDate.getDate() - 1);
    } else if (dates.includes(yesterdayStr)) {
      streak = 1;
      expectedDate = new Date(Date.now() - 86400000);
      expectedDate.setDate(expectedDate.getDate() - 1);
    } else {
      return callback(null, 0);
    }

    while (true) {
      const dateStr = expectedDate.toLocaleDateString("en-CA");
      if (dates.includes(dateStr)) {
        streak++;
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else {
        break;
      }
    }
    return callback(null, streak);
  });
}

// Streaks endpoint
app.get("/api/streak", requireAuth, (req, res) => {
  const userId = req.session.userId;
  getLoggingStreak(userId, (err, streak) => {
    if (err) {
      console.error("Calculate streak error:", err);
      return res.status(500).json({ error: "Server error." });
    }
    return res.json({ streak });
  });
});

app.get("/", (req, res) => {
  if (!req.session?.userId) return res.redirect("/login.html");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/plans.html", (_req, res) => res.redirect(301, "/plans"));

app.get("/plans", requireAuthPage, (_req, res) => {
  res.sendFile(path.join(__dirname, "private", "plans.html"));
});

const listenArgs = HOST ? [PORT, HOST] : [PORT];
const server = app.listen(...listenArgs, () => {
  console.log(`${APP_NAME} running at ${APP_URL}`);
});

server.on("error", (err) => {
  console.error(`Failed to start ${APP_NAME}:`, err.message);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    db.close(() => process.exit(0));
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
