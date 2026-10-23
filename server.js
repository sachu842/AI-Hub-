// AI Hub server: accounts, login, and AI tools powered by the Claude API.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/* ---------- Load settings from .env (tiny loader, no extra package) ---------- */
(function loadEnv() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) return;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  });
})();

const express = require("express");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const { tools, categories, publicTools } = require("./tools");

const PORT = Number(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === "production";
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT) || 30;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const COOKIE = "aihub_token";

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (PROD) {
    console.error("JWT_SECRET is missing. Add it to your environment settings before starting in production.");
    process.exit(1);
  }
  JWT_SECRET = crypto.randomBytes(32).toString("hex");
  console.warn("No JWT_SECRET set. Using a temporary one, so everyone is logged out each time the server restarts.");
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("No ANTHROPIC_API_KEY set. Sign up and login will work, but the AI tools will show a setup message.");
}

/* ---------- Database ---------- */
const dbPath = path.resolve(process.env.DATABASE_PATH || path.join(__dirname, "data", "aihub.db"));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS usage (
    user_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  );
`);

const q = {
  byId: db.prepare("SELECT id, username, email FROM users WHERE id = ?"),
  byLogin: db.prepare("SELECT * FROM users WHERE email = ? OR username = ?"),
  insert: db.prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)"),
  getUsage: db.prepare("SELECT count FROM usage WHERE user_id = ? AND day = ?"),
  reserve: db.prepare(`
    INSERT INTO usage (user_id, day, count) VALUES (?, ?, 1)
    ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1 WHERE count < ?`),
  refund: db.prepare("UPDATE usage SET count = count - 1 WHERE user_id = ? AND day = ? AND count > 0")
};
const today = () => new Date().toISOString().slice(0, 10);
const usageFor = (userId) => {
  const row = q.getUsage.get(userId, today());
  const used = row ? row.count : 0;
  return { used, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - used) };
};

// A fake hash so a wrong username takes as long to reject as a wrong password
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

/* ---------- App ---------- */
const app = express();
app.disable("x-powered-by");
if (PROD) app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  next();
});
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

// Only accept JSON for changes. Together with SameSite cookies this blocks cross-site form posts.
app.use("/api", (req, res, next) => {
  if (req.method === "POST" && !req.is("application/json")) return res.status(415).json({ error: "Send JSON." });
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." }
});
const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false,
  message: { error: "You are sending requests too fast. Please wait a moment." }
});

/* ---------- Auth helpers ---------- */
const USERNAME_RE = /^\w{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function setSession(res, userId) {
  const token = jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: PROD, maxAge: 7 * 24 * 3600 * 1000, path: "/" });
}
function requireAuth(req, res, next) {
  try {
    const { uid } = jwt.verify(req.cookies[COOKIE] || "", JWT_SECRET);
    const user = q.byId.get(uid);
    if (!user) throw new Error("no user");
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Please log in." });
  }
}

/* ---------- Auth routes ---------- */
app.post("/api/signup", authLimiter, async (req, res) => {
  const username = String(req.body.username || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: "Username must be 3 to 24 letters, numbers or underscores." });
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: "Password must be 8 to 128 characters." });
  try {
    const hash = await bcrypt.hash(password, 12);
    const info = q.insert.run(username, email, hash);
    setSession(res, info.lastInsertRowid);
    res.status(201).json({ user: { username, email }, usage: usageFor(info.lastInsertRowid) });
  } catch (err) {
    if (String(err.code).startsWith("SQLITE_CONSTRAINT")) return res.status(409).json({ error: "That username or email is already registered." });
    console.error("signup failed:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

app.post("/api/login", authLimiter, async (req, res) => {
  const id = String(req.body.identifier || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!id || !password || password.length > 128) return res.status(400).json({ error: "Enter your email or username and password." });
  const user = q.byLogin.get(id, id);
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: "Wrong email, username or password." });
  setSession(res, user.id);
  res.json({ user: { username: user.username, email: user.email }, usage: usageFor(user.id) });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: { username: req.user.username, email: req.user.email }, usage: usageFor(req.user.id) });
});

/* ---------- Tools ---------- */
app.get("/api/tools", requireAuth, (req, res) => {
  res.json({ tools: publicTools, categories, usage: usageFor(req.user.id) });
});

const toolById = Object.fromEntries(tools.map((t) => [t.id, t]));

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) return "Send between 1 and 20 messages.";
  let total = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return "Bad message format.";
    if (m.role !== (i % 2 === 0 ? "user" : "assistant")) return "Messages must alternate between you and the assistant.";
    const len = m.content.trim().length;
    if (len < 1) return "Type something first.";
    if (len > 8000) return "That message is too long. Keep it under 8,000 characters.";
    total += len;
  }
  if (messages[messages.length - 1].role !== "user") return "The last message must be yours.";
  if (total > 30000) return "This conversation is too long. Start a new one.";
  return null;
}

async function callClaude(system, messages) {
  const url = process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system, messages })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error((data && data.error && data.error.message) || "Upstream error " + r.status);
      err.status = r.status;
      throw err;
    }
    return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  } finally {
    clearTimeout(timer);
  }
}

app.post("/api/tools/:id/run", requireAuth, aiLimiter, async (req, res) => {
  const tool = toolById[req.params.id];
  if (!tool) return res.status(404).json({ error: "Unknown tool." });
  const problem = validateMessages(req.body.messages);
  if (problem) return res.status(400).json({ error: problem });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "The AI is not set up yet. The site owner needs to add an API key." });
  }

  const day = today();
  const reserved = q.reserve.run(req.user.id, day, DAILY_LIMIT).changes === 1;
  if (!reserved) return res.status(429).json({ error: "You have used all " + DAILY_LIMIT + " requests for today. Come back tomorrow.", usage: usageFor(req.user.id) });

  try {
    const messages = req.body.messages.map((m) => ({ role: m.role, content: m.content.trim() }));
    const reply = await callClaude(tool.system, messages);
    if (!reply) throw new Error("Empty reply");
    res.json({ reply, usage: usageFor(req.user.id) });
  } catch (err) {
    q.refund.run(req.user.id, day); // a failed request does not count against the limit
    console.error("AI request failed:", err.status || "", err.message);
    let status = 502, msg = "The AI could not answer right now. Please try again.";
    if (err.name === "AbortError") { status = 504; msg = "The AI took too long. Please try again."; }
    else if (err.status === 401 || err.status === 403) msg = "The site's AI key was rejected. The site owner needs to check it.";
    else if (err.status === 429 || err.status === 529) { status = 503; msg = "The AI is busy. Please try again in a minute."; }
    res.status(status).json({ error: msg, usage: usageFor(req.user.id) });
  }
});

app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

/* ---------- Website files ---------- */
app.use(express.static(path.join(__dirname, "public"), { maxAge: PROD ? "1h" : 0 }));

app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") return res.status(400).json({ error: "Bad request." });
  console.error(err);
  res.status(500).json({ error: "Something went wrong." });
});

app.listen(PORT, () => console.log("AI Hub is running at http://localhost:" + PORT));
