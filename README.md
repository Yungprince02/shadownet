# ShadowNet

ShadowNet is a full-stack Web3 security MVP: accounts and sessions, SQLite-backed agent management, a real local HTTP honeypot on `8081`, a raw TCP honeypot on `8082`, and a marketplace populated only by captured honeypot traffic.

## Run locally

Requirements: Node.js 22+ (Node 24 recommended for the built-in `node:sqlite` module).

```bash
npm install
npm run build
node server.mjs
```

Open `http://localhost:8787`, create an account, and deploy a **Prey** agent from the Agents page. The server serves the built frontend and API together.

## Verify a real finding

In another terminal, after deploying Prey:

```bash
curl http://localhost:8081/admin
```

The request is logged as a finding and appears in the authenticated Dashboard and Marketplace. To probe the TCP honeypot:

```bash
curl telnet://localhost:8082
```

No random findings are generated. Honeypot traffic is isolated, and ShadowNet does not scan third-party systems or handle real user funds.

## Development

Run `npm run dev` for the Vite frontend with `/api` proxied to `http://localhost:8787`; run `npm run api` in a second terminal for the backend.
