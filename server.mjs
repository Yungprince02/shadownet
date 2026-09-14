import http from 'node:http'
import net from 'node:net'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'

import { DatabaseSync } from 'node:sqlite'
import { randomBytes, randomUUID, pbkdf2Sync } from 'node:crypto'

const port = Number(process.env.PORT || process.env.API_PORT || 8787)
const enableHoneypots = process.env.ENABLE_HONEYPOTS !== 'false'
const dataDir = join(process.cwd(), 'data')
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
const db = new DatabaseSync(join(dataDir, 'shadownet.db'))
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, wallet TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, last_seen TEXT);
  CREATE TABLE IF NOT EXISTS findings (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL, ip TEXT NOT NULL, user_agent TEXT, created_at TEXT NOT NULL, marketplace INTEGER DEFAULT 1);
  CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, yes INTEGER DEFAULT 0, no INTEGER DEFAULT 0);
`)
if (db.prepare('SELECT COUNT(*) AS count FROM proposals').get().count === 0) {
  const add = db.prepare('INSERT INTO proposals (id,title,description,status,yes,no) VALUES (?,?,?,?,?,?)')
  add.run('sip-04', 'Agent reputation v2', 'Route verified findings into operator reputation and staking multipliers.', 'ACTIVE', 842, 116)
  add.run('sip-03', 'Treasury safety buffer', 'Move 12% of protocol rewards into an incident response reserve.', 'PASSED', 1204, 88)
}

const now = () => new Date().toISOString()
const json = (response, status, payload) => { response.statusCode = status; response.end(JSON.stringify(payload)); return true }
const hashPassword = (password, salt = randomBytes(16).toString('hex')) => ({ salt, hash: pbkdf2Sync(password, salt, 120000, 64, 'sha256').toString('hex') })
const publicUser = (user) => ({ id: user.id, username: user.username, email: user.email, wallet: user.wallet, createdAt: user.created_at })
const tokenFor = (userId) => { const token = randomBytes(32).toString('hex'); db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(token, userId, Date.now() + 1000 * 60 * 60 * 24 * 14); return token }
const authUser = (request) => { const token = request.headers.authorization?.replace('Bearer ', ''); if (!token) return null; const session = db.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?').get(token, Date.now()); return session ? db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) : null }
const bodyOf = async (request) => { let raw = ''; for await (const chunk of request) raw += chunk; return raw ? JSON.parse(raw) : {} }

let preyOnline = false
const livePreyAgents = () => db.prepare("SELECT * FROM agents WHERE type IN ('Prey','Hybrid') AND status = 'ONLINE'").all()
const recordHit = (agent, kind, path, ip, userAgent) => {
  const timestamp = now(); const findingId = `hit-${randomUUID()}`
  db.prepare('INSERT INTO findings VALUES (?,?,?,?,?,?,?,?,?)').run(findingId, agent.id, agent.user_id, kind, path, ip, userAgent || 'unknown', timestamp, 1)
  db.prepare('INSERT INTO logs VALUES (?,?,?,?,?)').run(`log-${randomUUID()}`, agent.id, `${kind} signal`, `${ip} requested ${path}`, timestamp)
}
const refreshHoneypotState = () => { preyOnline = livePreyAgents().length > 0 }

const httpHoneypot = http.createServer((request, response) => {
  if (!preyOnline) { response.statusCode = 503; response.end('sandbox offline'); return }
  const agents = livePreyAgents(); agents.forEach((agent) => recordHit(agent, 'HTTP probe', request.url || '/', request.socket.remoteAddress || 'local', request.headers['user-agent']))
  response.writeHead(200, { 'Content-Type': 'text/html', 'X-ShadowNet-Decoy': 'isolated' }); response.end('<!doctype html><title>ShadowNet Admin</title><h1>Admin console</h1><p>Sandbox service online.</p>')
})
const tcpHoneypot = net.createServer((socket) => {
  if (!preyOnline) { socket.end('sandbox offline\n'); return }
  const agents = livePreyAgents(); agents.forEach((agent) => recordHit(agent, 'TCP connection', '/tcp/8082', socket.remoteAddress || 'local', 'tcp-client'))
  socket.end('SHADOWNET-SANDBOX/1.0\n')
})
if (enableHoneypots) {
  httpHoneypot.listen(8081)
  tcpHoneypot.listen(8082)
}

const api = async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*'); response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); response.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('X-Frame-Options', 'DENY'); response.setHeader('Content-Type', 'application/json')
  if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return true }
  const pathParts = (request.url || '').split('?')[0].split('/').filter(Boolean)
  if (pathParts[0] !== 'api') return false
  try {
    const user = authUser(request)
    if (pathParts[1] === 'health') return json(response, 200, { ok: true, honeypots: preyOnline ? 'online' : 'offline' })
    if (pathParts[1] === 'register' && request.method === 'POST') {
      const input = await bodyOf(request); if (!input.username || !input.email || !input.password || input.password.length < 8) return json(response, 400, { error: 'Username, email and an 8 character password are required.' })
      const { salt, hash } = hashPassword(input.password); const newUser = { id: `usr-${randomUUID()}`, username: input.username.trim(), email: input.email.trim().toLowerCase(), password_hash: hash, salt, created_at: now() }
      try { db.prepare('INSERT INTO users (id,username,email,password_hash,salt,created_at) VALUES (?,?,?,?,?,?)').run(newUser.id, newUser.username, newUser.email, newUser.password_hash, newUser.salt, newUser.created_at) } catch { return json(response, 409, { error: 'Username or email already exists.' }) }
      return json(response, 201, { user: publicUser(newUser), token: tokenFor(newUser.id) })
    }
    if (pathParts[1] === 'login' && request.method === 'POST') {
      const input = await bodyOf(request); const found = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(String(input.identifier || '').toLowerCase(), input.identifier)
      if (!found || hashPassword(input.password || '', found.salt).hash !== found.password_hash) return json(response, 401, { error: 'Invalid credentials.' })
      return json(response, 200, { user: publicUser(found), token: tokenFor(found.id) })
    }
    if (pathParts[1] === 'logout' && request.method === 'POST') { const token = request.headers.authorization?.replace('Bearer ', ''); if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token); return json(response, 200, { ok: true }) }
    if (pathParts[1] === 'me' && request.method === 'GET') return user ? json(response, 200, { user: publicUser(user) }) : json(response, 401, { error: 'Authentication required.' })
    if (pathParts[1] === 'public-stats') { const stats = db.prepare("SELECT COUNT(*) AS findings FROM findings").get(); return json(response, 200, { findings: stats.findings, agents: db.prepare("SELECT COUNT(*) AS count FROM agents WHERE status = 'ONLINE'").get().count, uptime: preyOnline ? '99.98%' : '100%' }) }
    if (pathParts[1] === 'marketplace') return json(response, 200, { listings: db.prepare('SELECT f.*, a.name AS agent_name FROM findings f JOIN agents a ON a.id=f.agent_id WHERE f.marketplace=1 ORDER BY f.created_at DESC LIMIT 30').all() })
    if (!user) return json(response, 401, { error: 'Authentication required.' })
    if (pathParts[1] === 'agents' && request.method === 'GET') return json(response, 200, { agents: db.prepare('SELECT * FROM agents WHERE user_id = ? ORDER BY created_at DESC').all(user.id) })
    if (pathParts[1] === 'agents' && request.method === 'POST') {
      const input = await bodyOf(request); const type = ['Predator', 'Prey', 'Hybrid'].includes(input.type) ? input.type : 'Prey'; const agent = { id: `agt-${randomUUID()}`, user_id: user.id, name: input.name?.trim() || `${type.toUpperCase()}-${Math.floor(Math.random() * 90 + 10)}`, type, status: 'ONLINE', created_at: now(), last_seen: now() }
      db.prepare('INSERT INTO agents VALUES (?,?,?,?,?,?,?)').run(...Object.values(agent)); db.prepare('INSERT INTO logs VALUES (?,?,?,?,?)').run(`log-${randomUUID()}`, agent.id, 'Agent deployed', `${agent.type} sandbox initialized`, now()); refreshHoneypotState(); return json(response, 201, { agent })
    }
    if (pathParts[1] === 'agents' && pathParts[2] && request.method === 'POST') {
      const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?').get(pathParts[2], user.id); if (!agent) return json(response, 404, { error: 'Agent not found.' }); const input = await bodyOf(request)
      if (input.action === 'delete') db.prepare('DELETE FROM agents WHERE id = ?').run(agent.id); else db.prepare('UPDATE agents SET status = ?, last_seen = ? WHERE id = ?').run(input.action === 'start' ? 'ONLINE' : 'OFFLINE', now(), agent.id); refreshHoneypotState(); return json(response, 200, { ok: true })
    }
    if (pathParts[1] === 'findings') return json(response, 200, { findings: db.prepare('SELECT f.*, a.name AS agent_name FROM findings f JOIN agents a ON a.id=f.agent_id WHERE f.user_id=? ORDER BY f.created_at DESC LIMIT 40').all(user.id), logs: db.prepare('SELECT l.*, a.name AS agent_name FROM logs l JOIN agents a ON a.id=l.agent_id WHERE a.user_id=? ORDER BY l.created_at DESC LIMIT 40').all(user.id) })
    if (pathParts[1] === 'wallet' && request.method === 'POST') { const input = await bodyOf(request); db.prepare('UPDATE users SET wallet = ? WHERE id = ?').run(input.wallet, user.id); return json(response, 200, { wallet: input.wallet }) }
    if (pathParts[1] === 'change-password' && request.method === 'POST') { const input = await bodyOf(request); if (hashPassword(input.current || '', user.salt).hash !== user.password_hash) return json(response, 400, { error: 'Current password is incorrect.' }); const next = hashPassword(input.password); db.prepare('UPDATE users SET password_hash=?, salt=? WHERE id=?').run(next.hash, next.salt, user.id); return json(response, 200, { ok: true }) }
    if (pathParts[1] === 'proposals') return json(response, 200, { proposals: db.prepare('SELECT * FROM proposals').all() })
    return json(response, 404, { error: 'Route not found.' })
  } catch (error) { return json(response, 500, { error: error.message }) }
}

const server = http.createServer(async (request, response) => { 
  if (await api(request, response)) return; 
  const pathname = request.url === '/' ? '/index.html' : request.url.split('?')[0]; 
  const filePath = join(process.cwd(), 'dist', pathname); 
  if (existsSync(filePath)) { 
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }; 
    response.setHeader('Content-Type', types[extname(filePath)] || 'application/octet-stream'); 
    response.end(readFileSync(filePath)); 
    return 
  } 
  response.statusCode = 404; 
  response.end('Not found') 
})

server.listen(port, () => {
  console.log(`ShadowNet online on port ${port} | honeypots ${enableHoneypots ? 'enabled on :8081/:8082' : 'disabled for hosted web service'}`)
})
