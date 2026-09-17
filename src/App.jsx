import { useEffect, useState } from 'react'
import './App.css'

const request = async (path, options = {}) => {
  const token = localStorage.getItem('shadownet_token')
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

const thenAgo = (value) => {
  if (!value) return 'just now'
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  return `${Math.round(seconds / 3600)}h ago`
}

const navItems = ['Dashboard', 'Prey', 'Predator', 'Marketplace', 'Knowledge', 'Activity', 'Wallet', 'Protocol']
const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))
const preyFields = [
  ['name', 'Honeypot name'], ['os', 'Server / OS type'], ['hostname', 'Hostname'], ['services', 'Exposed services'],
  ['ports', 'Open ports'], ['difficulty', 'Difficulty level'], ['tags', 'Tags'],
]
const predatorFields = [
  ['name', 'Predator name'], ['scope', 'Scan scope'], ['intensity', 'Scan intensity'], ['runtime', 'Maximum runtime'],
  ['modules', 'Authorized discovery modules'], ['logging', 'Logging level'],
]

function App() {
  const [user, setUser] = useState(null)
  const [page, setPage] = useState('Dashboard')
  const [authMode, setAuthMode] = useState(null)
  const [agents, setAgents] = useState([])
  const [findings, setFindings] = useState([])
  const [logs, setLogs] = useState([])
  const [market, setMarket] = useState([])
  const [stats, setStats] = useState({})
  const [notice, setNotice] = useState('')
  const [deployType, setDeployType] = useState('Prey')
  const [deployState, setDeployState] = useState(null)
  const [guestAgents, setGuestAgents] = useState([])
  const [guestWallet, setGuestWallet] = useState(localStorage.getItem('shadownet_guest_wallet') || '')
  const [telemetryPulse, setTelemetryPulse] = useState(0)
  const [scanResults, setScanResults] = useState([])
  const [scanning, setScanning] = useState(false)
  const [agentAction, setAgentAction] = useState(null)
  const [honeypots, setHoneypots] = useState([])
  const [shadowBalance, setShadowBalance] = useState(1000)
  const [honeypotProfile, setHoneypotProfile] = useState('Web application decoy')
  const [predatorScan, setPredatorScan] = useState(null)
  const [pageLoading, setPageLoading] = useState(false)
  const [preyConfig, setPreyConfig] = useState({
    name: 'PREY-003',
    os: 'Ubuntu 24.04 LTS',
    hostname: 'edge-node-03',
    services: 'SSH, Nginx, PostgreSQL',
    ports: '22, 80, 443, 5432',
    difficulty: 'Intermediate',
    tags: 'web, linux, database',
  })
  const [predatorConfig, setPredatorConfig] = useState({
    name: 'PREDATOR-001',
    scope: 'Authorized Prey only',
    intensity: 'Balanced',
    runtime: '30 minutes',
    modules: 'Port discovery, Service enumeration, Configuration analysis, Known-vulnerability detection',
    logging: 'Detailed',
  })

  useEffect(() => {
    const token = localStorage.getItem('shadownet_token')
    if (!token) return

    request('me')
      .then((data) => setUser(data.user))
      .catch(() => localStorage.removeItem('shadownet_token'))
  }, [])

  const refresh = async () => {
    try {
      const data = await Promise.all([
        user ? request('agents') : request('guest-agents').catch(() => ({ agents: guestAgents })),
        user ? request('findings') : request('public-findings').catch(() => ({ findings: [], logs: [] })),
        request('marketplace'),
        request('public-stats'),
        request('honeypots').catch(() => ({ honeypots: [] })),
        request('wallet-balance').catch(() => ({ balance: 1000 })),
      ])

      setAgents(data[0]?.agents || [])
      setFindings(data[1]?.findings || [])
      setLogs(data[1]?.logs || [])
      setMarket(data[2]?.listings || [])
      setStats(data[3] || {})
      setHoneypots(data[4]?.honeypots || [])
      setShadowBalance(data[5]?.balance ?? 1000)
    } catch (error) {
      if (user) setNotice(error.message)
    }
  }

  useEffect(() => {
    refresh()
    const interval = window.setInterval(refresh, 5000)
    return () => window.clearInterval(interval)
  }, [user, guestAgents])

  useEffect(() => {
    const interval = window.setInterval(() => setTelemetryPulse((current) => current + 1), 1100)
    return () => window.clearInterval(interval)
  }, [])

  const logout = async () => {
    try {
      await request('logout', { method: 'POST' })
    } catch {}

    localStorage.removeItem('shadownet_token')
    setUser(null)
    setNotice('Live operator session active')
  }

  const navigateTo = (nextPage) => {
    if (nextPage === page) return
    setPageLoading(true)
    window.setTimeout(() => {
      setPage(nextPage)
      setPageLoading(false)
    }, 420)
  }

  const deployAgent = async () => {
    setDeployState({ type: deployType, phase: 'booting' })

    try {
      await wait(650)
      setDeployState({ type: deployType, phase: 'provisioning' })

      if (!user) {
        const data = await request('guest-agents', { method: 'POST', body: JSON.stringify({ type: deployType, profile: honeypotProfile, name: deployType === 'Prey' ? preyConfig.name : predatorConfig.name, config: deployType === 'Prey' ? preyConfig : predatorConfig }) })
        setGuestAgents((current) => [data.agent, ...current.filter((item) => item.id !== data.agent.id)])
        setDeployState({ type: deployType, phase: 'peer-sync' })
        await wait(950)
        setDeployState({ type: deployType, phase: 'online' })
        setNotice(`${deployType} honeypot is live on HTTP :8081 and TCP :8082`)
        await refresh()
        return
      }

      await request('agents', {
        method: 'POST',
        body: JSON.stringify({ type: deployType, profile: honeypotProfile, name: deployType === 'Prey' ? preyConfig.name : predatorConfig.name, config: deployType === 'Prey' ? preyConfig : predatorConfig }),
      })

      setDeployState({ type: deployType, phase: 'peer-sync' })
      await wait(950)
      setDeployState({ type: deployType, phase: 'online' })
      setNotice(`${deployType} honeypot deployed and listening`)
      await refresh()
    } catch (error) {
      setNotice(error.message)
      setDeployState(null)
    }
  }

  const changeAgentState = async (agent, action) => {
    if (agentAction) return
    setAgentAction(`${agent.id}:${action}`)
    try {
      if (!user) {
        await request(`guest-agents/${agent.id}`, { method: 'POST', body: JSON.stringify({ action }) })
        setNotice(action === 'delete' ? 'Guest agent deleted' : `Guest agent ${action}ed`)
        await refresh()
        return
      }

      await request(`agents/${agent.id}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      })

      setNotice(action === 'delete' ? 'Agent deleted' : `Agent ${action}ed`)
      await refresh()
    } catch (error) {
      setNotice(error.message)
    } finally {
      setAgentAction(null)
    }
  }

  const scanLocalPorts = async () => {
    setScanning(true)
    try {
      const data = await request('scan', { method: 'POST', body: JSON.stringify({ target: '127.0.0.1' }) })
      setScanResults(data.results || [])
      setNotice(`Local scan complete: ${(data.results || []).filter((item) => item.status === 'open').length} open ports found`)
    } catch (error) {
      setNotice(error.message)
    } finally {
      setScanning(false)
    }
  }

  const runPredatorScan = async (predatorId, honeypotId) => {
    setPredatorScan({ predatorId, honeypotId, state: 'scanning' })
    try {
      const data = await request('predator-scan', { method: 'POST', body: JSON.stringify({ predatorId, honeypotId }) })
      setPredatorScan({ predatorId, honeypotId, state: 'complete', data })
      setNotice(`Predator scan complete: ${data.findings.length} sale-ready finding${data.findings.length === 1 ? '' : 's'}`)
      await refresh()
    } catch (error) {
      setPredatorScan({ predatorId, honeypotId, state: 'error' })
      setNotice(error.message)
    }
  }

  const purchaseFinding = async (finding) => {
    try {
      const data = await request(`marketplace/${finding.id}/purchase`, { method: 'POST' })
      setShadowBalance(data.balance)
      setNotice(`Finding acquired for ${data.price} SHADOW`)
      await refresh()
    } catch (error) {
      setNotice(error.message)
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />

        <div className="user-chip">
          <div className="avatar">{user ? user.username[0].toUpperCase() : 'G'}</div>
          <div>
            <strong>{user ? user.username : 'Open operator'}</strong>
            <small>{user ? 'OPERATOR / TIER 01' : 'PUBLIC OPERATOR / LIVE ACCESS'}</small>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item}
              type="button"
              className={page === item ? 'nav-item active' : 'nav-item'}
              onClick={() => navigateTo(item)}
            >
              <span className="nav-glyph">{item[0]}</span>
              {item}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="network-status">
            <span className="status-dot" /> NETWORK NOMINAL
            <strong>99.98% uptime</strong>
          </div>
          {user ? (
            <button type="button" className="signout" onClick={logout}>-&gt; SIGN OUT</button>
          ) : (
            <button type="button" className="signout" onClick={() => setAuthMode('login')}>-&gt; OPERATOR LOGIN</button>
          )}
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="eyebrow">SHADOWNET / {page.toUpperCase()}</span>
            <h1>{page === 'Dashboard' ? 'Command center' : page}</h1>
          </div>

          <div className="top-actions">
            <span className="live-pill"><i /> LIVE NETWORK</span>
            <span className="shadow-balance">{shadowBalance.toLocaleString()} SHADOW</span>
            <WalletPicker user={user} wallet={guestWallet} setWallet={setGuestWallet} setNotice={setNotice} />
          </div>
        </header>

        {notice && (
          <div className="notice-bar">
            {notice}
            <button type="button" onClick={() => setNotice('')}>x</button>
          </div>
        )}

        <LiveTelemetry pulse={telemetryPulse} findings={findings} logs={logs} agents={agents} stats={stats} />
        <CyberScene page={page} findings={findings} agents={agents} setPage={navigateTo} />

        {pageLoading && <div className="page-sync"><span className="sync-spinner" /><span>SYNCING PROTOCOL STATE</span></div>}

        <DashboardPage
          page={page}
          stats={stats}
          findings={findings}
          agents={agents}
          logs={logs}
          market={market}
          user={user}
          deployType={deployType}
          setDeployType={setDeployType}
          deployAgent={deployAgent}
          deployState={deployState}
          guestWallet={guestWallet}
          setGuestWallet={setGuestWallet}
          setPage={setPage}
          changeAgentState={changeAgentState}
          setNotice={setNotice}
          agentAction={agentAction}
          scanResults={scanResults}
          scanning={scanning}
          scanLocalPorts={scanLocalPorts}
          honeypots={honeypots}
          shadowBalance={shadowBalance}
          honeypotProfile={honeypotProfile}
          setHoneypotProfile={setHoneypotProfile}
          predatorScan={predatorScan}
          runPredatorScan={runPredatorScan}
          purchaseFinding={purchaseFinding}
          preyConfig={preyConfig}
          setPreyConfig={setPreyConfig}
          predatorConfig={predatorConfig}
          setPredatorConfig={setPredatorConfig}
        />
      </main>
      {authMode && (
        <div className="auth-modal">
          <AuthScreen mode={authMode} onMode={setAuthMode} onSuccess={(nextUser) => { setUser(nextUser); setAuthMode(null) }} onClose={() => setAuthMode(null)} />
        </div>
      )}
    </div>
  )
}

function LiveTelemetry({ pulse, findings, logs, agents, stats }) {
  const latest = logs[0] || findings[0]
  const onlineAgents = stats.agents || agents.filter((agent) => agent.status === 'ONLINE').length
  const signalCount = stats.findings || findings.length
  const packet = String((signalCount * 17 + pulse) % 10000).padStart(4, '0')

  return (
    <section className="telemetry-strip" aria-label="Live runtime telemetry">
      <div className="telemetry-state">
        <span className="telemetry-beacon" />
        <div>
          <span className="eyebrow">RUNTIME TELEMETRY</span>
          <strong>CAPTURE ENGINE ACTIVE</strong>
        </div>
      </div>
      <div className="telemetry-wave" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => <i key={index} style={{ '--delay': `${index * 0.06}s`, '--height': `${20 + ((index * 17 + pulse * 9) % 65)}%` }} />)}
      </div>
      <div className="telemetry-readout">
        <span>PACKET {packet}</span>
        <span>AGENTS {String(onlineAgents).padStart(2, '0')}</span>
        <span>{latest ? `LAST ${thenAgo(latest.created_at).toUpperCase()}` : 'AWAITING SIGNAL'}</span>
      </div>
    </section>
  )
}

function CyberScene({ page, findings, agents, setPage }) {
  const sceneName = page.toLowerCase()
  const labels = {
    Dashboard: ['CORE', 'SENSOR', 'DECOY', 'SIGNAL'],
    Agents: ['BOOT', 'SYNC', 'MESH', 'LIVE'],
    Marketplace: ['SCAN', 'CLASSIFY', 'VERIFY', 'PUBLISH'],
    Protocol: ['PREDATOR', 'PREY', 'HYBRID', 'IMMUNITY'],
    Governance: ['PROPOSAL', 'VOTE', 'QUORUM', 'CONSENSUS'],
    Docs: ['INPUT', 'NORMALIZE', 'ANALYZE', 'DEFEND'],
    Activity: ['INGEST', 'CORRELATE', 'ALERT', 'TRACE'],
    Profile: ['KEY', 'IDENTITY', 'REPUTATION', 'TRUST'],
  }[page] || ['CORE', 'SIGNAL', 'MESH', 'LIVE']
  const destinations = page === 'Dashboard' ? ['Dashboard', 'Prey', 'Marketplace', 'Protocol'] : ['Dashboard', 'Predator', 'Activity', 'Wallet']

  return (
    <section className={`cyber-scene scene-${sceneName}`} aria-label={`${page} visual system`}>
      <div className="scene-grid" />
      <div className="scene-scanline" />
      <div className="scene-orbit orbit-large" />
      <div className="scene-orbit orbit-small" />
      <div className="scene-core"><span>{page === 'Dashboard' ? 'S' : page[0]}</span></div>
      <div className="scene-connector connector-one" />
      <div className="scene-connector connector-two" />
      <div className="scene-connector connector-three" />
      <div className="scene-nodes">
        {labels.map((label, index) => <button type="button" className={`scene-node node-${index + 1}`} key={label} onClick={() => setPage(destinations[index])}>{label}<b>-&gt;</b></button>)}
      </div>
      <div className="scene-readout">
        <span>{page.toUpperCase()} / LIVE MODEL</span>
        <strong>{page === 'Agents' ? `${agents.filter((agent) => agent.status === 'ONLINE').length} ACTIVE UNITS` : `${findings.length || 0} SIGNALS TRACKED`}</strong>
      </div>
      <div className="scene-bars" aria-hidden="true">
        {Array.from({ length: 24 }, (_, index) => <i key={index} style={{ '--scene-delay': `${index * 0.07}s`, '--scene-height': `${22 + ((index * 23) % 68)}%` }} />)}
      </div>
    </section>
  )
}

function DashboardPage({ page, stats, findings, agents, logs, market, user, deployType, setDeployType, deployAgent, deployState, guestWallet, setGuestWallet, setPage, changeAgentState, setNotice, scanResults, scanning, scanLocalPorts, agentAction, honeypots, shadowBalance, honeypotProfile, setHoneypotProfile, predatorScan, runPredatorScan, purchaseFinding, preyConfig, setPreyConfig, predatorConfig, setPredatorConfig }) {
  if (page === 'Dashboard') {
    return (
      <>
        <section className="page-header">
          <div>
            <span className="eyebrow"><i className="status-dot" /> OPERATIONAL STATUS / NOMINAL</span>
            <h2>Good to see you, operator.</h2>
            <p>Your agents are the perimeter. Your findings are the signal.</p>
          </div>
          <button type="button" className="primary" onClick={() => setPage('Agents')}>MANAGE AGENTS -&gt;</button>
        </section>

        <div className="stats-grid">
          <Stat label="CAPTURED SIGNALS" value={stats.findings || findings.length} delta="REAL HITS" />
          <Stat label="ACTIVE AGENTS" value={stats.agents || agents.filter((agent) => agent.status === 'ONLINE').length} delta="ONLINE" />
          <Stat label="NETWORK UPTIME" value={stats.uptime || '100%'} delta="NOMINAL" />
          <Stat label="REPUTATION" value="01" delta="OPERATOR TIER" />
        </div>

        <div className="panel-grid top-grid">
          <Panel title="Threat surface" kicker="01 / NETWORK MAP" action="LIVE VIEW" onAction={() => setPage('Protocol')}>
            <div className="network-map">
              <div className="node node-core">CORE</div>
              <div className="node node-gateway">GATEWAY</div>
              <div className="node node-agent">PREY</div>
              <div className="node node-attack">ATTACK</div>
              <div className="connection c1" />
              <div className="connection c2" />
              <div className="connection c3" />
            </div>
          </Panel>

          <Panel title="Agent lifecycle" kicker="02 / DEPLOYMENT">
            <div className={deployState ? 'stepper deploy-active' : 'stepper'}>
              {['Booting', 'Provisioning', 'Peer sync', 'Live'].map((step, index) => {
                const phaseIndex = { booting: 0, provisioning: 1, 'peer-sync': 2, online: 3 }[deployState?.phase] ?? -1
                const isActive = index <= phaseIndex
                const isCurrent = index === phaseIndex

                return (
                  <div className={`${isActive ? 'step active' : 'step'}${isCurrent ? ' current' : ''}`} key={step}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <p>{step}</p>
                  </div>
                )
              })}
            </div>

            <div className="console-box">
              <div><span className="token-key">agent</span>: {deployState?.type || 'Prey'}</div>
              <div><span className="token-key">status</span>: {deployState ? deployState.phase.toUpperCase() : 'STANDBY'}</div>
              <div><span className="token-key">http</span>: {deployState?.phase === 'online' ? 'LISTENING :8081' : 'ALLOCATING'}</div>
              <div><span className="token-key">tcp</span>: {deployState?.phase === 'online' ? 'LISTENING :8082' : 'ALLOCATING'}</div>
            </div>
            <div className="deploy-progress"><span style={{ width: `${({ booting: 18, provisioning: 46, 'peer-sync': 76, online: 100 }[deployState?.phase] || 0)}%` }} /></div>
          </Panel>
        </div>

        <div className="panel-grid section-grid">
          <Panel title="Your perimeter" kicker="03 / AGENT FLEET" action="VIEW ALL" onAction={() => setPage('Agents')}>
            {agents.length ? (
              agents.slice(0, 4).map((agent) => (
                <AgentRow key={agent.id} agent={agent} onAction={changeAgentState} busy={agentAction?.startsWith(`${agent.id}:`)} />
              ))
            ) : (
              <EmptyState title="Your perimeter is empty" copy="Deploy a Prey agent to activate the first sandbox." button="DEPLOY PREY -&gt;" onClick={() => setPage('Agents')} />
            )}
          </Panel>

          <Panel title="Recent findings" kicker="04 / LIVE SIGNALS" action="MARKETPLACE" onAction={() => setPage('Marketplace')}>
            {findings.length ? (
              findings.slice(0, 5).map((item) => <FindingRow key={item.id} item={item} />)
            ) : (
              <EmptyState title="Awaiting a signal" copy="Try curl http://localhost:8081/admin after deploying Prey." />
            )}
          </Panel>
        </div>

        <Panel title="Event history" kicker="05 / OPERATOR LOG" className="log-panel">
          {logs.slice(0, 4).map((log) => (
            <div className="log-row" key={log.id}>
              <time>{thenAgo(log.created_at)}</time>
              <span>{log.agent_name}</span>
              <strong>{log.event}</strong>
              <small>{log.detail}</small>
            </div>
          ))}
        </Panel>
      </>
    )
  }

  if (page === 'Prey') {
    const preyAgents = agents.filter((agent) => agent.type === 'Prey' || agent.type === 'Hybrid')
    return (
      <>
        <PageIntro title="Configure a Prey" kicker="ISOLATED ENVIRONMENT / 01" intro="Shape a realistic, controlled server environment before deployment. Every Prey remains isolated and available only to authorized Predators." />
        <ConfigPanel title="Prey configuration" kicker="SERVER PROFILE" fields={preyFields} values={preyConfig} setValues={setPreyConfig} />
        <div className="deploy-bar">
          <div><span className="eyebrow">DEPLOYMENT</span><h3>Validate, isolate, activate</h3></div>
          <select value={deployType} onChange={(event) => setDeployType(event.target.value)}><option>Prey</option><option>Hybrid</option></select>
          <button type="button" className="primary" onClick={deployAgent}>DEPLOY PREY -&gt;</button>
        </div>
        <div className="status-banner"><span className="eyebrow">ACTIVE PREY / {preyAgents.length}</span><strong>{deployState ? `${deployState.type} / ${deployState.phase.toUpperCase()}` : 'READY / AUTHORIZED ONLY'}</strong></div>
        <div className="prey-grid">
          {preyAgents.length ? preyAgents.map((agent) => <PreyCard key={agent.id} agent={agent} findings={findings} />) : <EmptyState title="No Prey environments" copy="Configure a server profile above to create the first isolated target." />}
        </div>
      </>
    )
  }

  if (page === 'Predator') {
    return (
      <>
        <PageIntro title="Configure a Predator" kicker="AUTHORIZED SECURITY AGENT / 02" intro="Define the agent's scope, intensity, modules, and runtime before it can touch a target. Safe verification is the default." />
        <ConfigPanel title="Predator configuration" kicker="AGENT POLICY" fields={predatorFields} values={predatorConfig} setValues={setPredatorConfig} />
        <div className="deploy-bar"><div><span className="eyebrow">AGENT DEPLOYMENT</span><h3>Initialize autonomous analysis</h3></div><select value={deployType} onChange={(event) => setDeployType(event.target.value)}><option>Predator</option><option>Hybrid</option></select><button type="button" className="primary" onClick={deployAgent}>DEPLOY PREDATOR -&gt;</button></div>
        <PredatorConsole agents={agents} honeypots={honeypots} scan={predatorScan} onScan={runPredatorScan} />
      </>
    )
  }

  if (page === 'Knowledge') {
    const packages = [...findings, ...market].slice(0, 12)
    return (
      <>
        <PageIntro title="Predator knowledge" kicker="MACHINE-READABLE DEFENSE / 04" intro="Detection packages from your verified findings, purchased intelligence, and platform research. Predators use only packages you authorize." />
        <div className="knowledge-summary"><Stat label="AVAILABLE PACKAGES" value={packages.length || 0} delta="READY TO AUTHORIZE" /><Stat label="VERIFIED FINDINGS" value={findings.length || 0} delta="EVIDENCE LINKED" /><Stat label="SHADOW BALANCE" value={shadowBalance.toLocaleString()} delta="INTERNAL CURRENCY" /></div>
        <div className="knowledge-grid">{packages.length ? packages.map((item, index) => <article className="knowledge-card" key={`${item.id}-${index}`}><div className="listing-head"><span className="severity" /> {item.kind || 'Service exposure'} <small>{item.cve || 'CWE-284'}</small></div><h3>{item.title || item.kind || 'Verified service exposure'}</h3><p>Detection indicators, required conditions, safe verification, and remediation guidance.</p><footer><span>{item.source || 'ShadowNet research'}</span><b>{item.sold_to ? 'PURCHASED' : 'LOCAL PACKAGE'}</b></footer></article>) : <EmptyState title="Knowledge library is empty" copy="Verified Predator findings will become reusable machine-readable packages here." />}</div>
      </>
    )
  }

  if (page === 'Wallet') {
    return (
      <>
        <PageIntro title="SHADOW wallet" kicker="MARKETPLACE ECONOMY / 05" intro="Use SHADOW for verified finding purchases. Balances are internal marketplace credits; platform fees remain configurable at the protocol layer." />
        <div className="wallet-overview"><div><span className="eyebrow">AVAILABLE BALANCE</span><strong>{shadowBalance.toLocaleString()} <small>SHADOW</small></strong><p>Pending balance: 0 SHADOW</p></div><WalletPicker user={user} wallet={guestWallet} setWallet={setGuestWallet} setNotice={setNotice} /></div>
        <div className="panel wallet-ledger"><div className="panel-head"><div><span className="eyebrow">TRANSACTION HISTORY</span><h3>Recent marketplace activity</h3></div></div><div className="log-row"><time>NOW</time><span>SHADOWNET</span><strong>Wallet ready</strong><small>Finding purchases and seller earnings appear here.</small></div></div>
      </>
    )
  }

  if (page === 'Agents') {
    return (
      <>
        <PageIntro title="Agent fleet" kicker="OPERATIONAL UNITS / 02" intro="Deploy isolated security agents. Prey provides the controlled environment; Predator and Hybrid run approved research workflows." />

        <div className="deploy-bar">
          <div>
            <span className="eyebrow">NEW AGENT</span>
            <h3>Choose a role</h3>
          </div>

          <select value={deployType} onChange={(event) => setDeployType(event.target.value)}>
            <option>Prey</option>
            <option>Predator</option>
            <option>Hybrid</option>
          </select>

          {deployType !== 'Predator' && (
            <select value={honeypotProfile} onChange={(event) => setHoneypotProfile(event.target.value)} aria-label="Honeypot profile">
              <option>Web application decoy</option>
              <option>API gateway decoy</option>
              <option>Admin console decoy</option>
            </select>
          )}

          <button type="button" className="primary" onClick={deployAgent}>DEPLOY AGENT -&gt;</button>
        </div>

        <div className="status-banner">
          <span className="eyebrow">DEPLOYMENT STATE</span>
          <strong>{deployState ? `${deployState.type} / ${deployState.phase.toUpperCase()}` : 'READY / STANDBY'}</strong>
        </div>

        <div className="agent-grid">
          {agents.length ? (
            agents.map((agent) => (
              <article className="agent-card" key={agent.id}>
                <div className="card-head">
                  <span className={`agent-icon ${agent.type.toLowerCase()}`}>{agent.type[0]}</span>
                  <span className={`status ${agent.status.toLowerCase()}`}><i /> {agent.status}</span>
                </div>

                <h3>{agent.name}</h3>
                <p>{agent.type} agent / isolated runtime</p>
                <AgentRuntime agent={agent} />

                <div className="agent-meta">
                  <span>CREATED <b>{thenAgo(agent.created_at)}</b></span>
                  <span>ROLE <b>{agent.type.toUpperCase()}</b></span>
                </div>

                <div className="agent-actions">
                  {agent.status === 'ONLINE' ? (
                    <button type="button" disabled={agentAction?.startsWith(`${agent.id}:`)} onClick={() => changeAgentState(agent, 'stop')}>{agentAction === `${agent.id}:stop` ? 'STOPPING...' : 'STOP'}</button>
                  ) : (
                    <button type="button" disabled={agentAction?.startsWith(`${agent.id}:`)} onClick={() => changeAgentState(agent, 'start')}>{agentAction === `${agent.id}:start` ? 'STARTING...' : 'START'}</button>
                  )}
                  <button type="button" className="danger" disabled={agentAction?.startsWith(`${agent.id}:`)} onClick={() => changeAgentState(agent, 'delete')}>{agentAction === `${agent.id}:delete` ? 'REMOVING...' : 'DELETE'}</button>
                </div>
              </article>
            ))
          ) : (
            <EmptyState title="No agents deployed" copy="Deploy Prey to activate the local HTTP and TCP honeypots." button="DEPLOY PREY -&gt;" onClick={deployAgent} />
          )}
        </div>
        <PredatorConsole agents={agents} honeypots={honeypots} scan={predatorScan} onScan={runPredatorScan} />
      </>
    )
  }

  if (page === 'Marketplace') {
    return (
      <>
        <PageIntro title="Threat marketplace" kicker="PUBLIC INTELLIGENCE / 03" intro="Verified signals from live agent activity. This market grows from real honeypot traffic." />
        <div className="listing-grid">
          {market.length ? (
            market.map((item) => (
              <article className="listing-card" key={item.id}>
                <div className="listing-head">
                  <span className="severity" />
                  {item.kind}
                  <small>{thenAgo(item.created_at)}</small>
                </div>
                <h3>{item.path}</h3>
                <p>{item.ip} · {item.user_agent}</p>
                <footer>
                  <span>{item.agent_name}</span>
                  {item.sold_to ? <b>ACQUIRED</b> : <button type="button" className="buy-button" onClick={() => purchaseFinding(item)}>{item.price || 25} SHADOW / BUY</button>}
                </footer>
              </article>
            ))
          ) : (
            <EmptyState title="No verified listings yet" copy="Deploy a Prey agent and send a request to localhost:8081/admin." />
          )}
        </div>
      </>
    )
  }

  if (page === 'Protocol') {
    return (
      <>
        <PageIntro title="The protocol" kicker="ARCHITECTURE / 01" intro="Authorized sandbox intelligence only." />
        <div className="info-grid">
          <InfoCard title="Predator" copy="Hunts for vulnerability patterns inside approved targets and produces evidence for review." />
          <InfoCard title="Prey" copy="Runs a decoy HTTP and TCP surface. It attracts real connection attempts without exposing funds or production systems." />
          <InfoCard title="Hybrid" copy="Switches between defense research and luring based on operator policy and reputation." />
          <InfoCard title="Anti-gaming" copy="Novelty checks compare findings against public vulnerability data and platform history. Staking, slashing, and external validation discourage self-dealing." />
        </div>
        <PortScanner results={scanResults} scanning={scanning} onScan={scanLocalPorts} />
      </>
    )
  }

  if (page === 'Docs') {
    return (
      <>
        <PageIntro title="Operator docs" kicker="DOCUMENTATION / 05" intro="The shortest path from account creation to your first verified signal." />
        <div className="info-grid">
          <InfoCard title="01 / Deploy" copy="Open Agents, choose Prey, and deploy. Local sandbox listeners come online and begin capturing external probes." />
          <InfoCard title="02 / Validate" copy="Every hit is normalized into a structured finding with source IP, path, user agent, and detection confidence." />
          <InfoCard title="03 / Share" copy="Verified signals can be published to the marketplace and used by other operators to strengthen their defense layer." />
        </div>
      </>
    )
  }

  if (page === 'Activity') {
    return (
      <>
        <PageIntro title="Activity stream" kicker="THREAT FEED / 04" intro="Live incident communication and operator events from the network." />
        <div className="feed-list">
          {logs.length ? (
            logs.map((log) => (
              <div className="activity-row" key={log.id}>
                <span className="time">{thenAgo(log.created_at)}</span>
                <div>
                  <strong>{log.event}</strong>
                  <small>{log.agent_name}</small>
                </div>
                <p>{log.detail}</p>
              </div>
            ))
          ) : (
            <EmptyState title="No activity yet" copy="Once a sandbox agent is live, hit data will start flowing here." />
          )}
        </div>
      </>
    )
  }

  if (page === 'Profile') {
    return <ProfileCard user={user} wallet={guestWallet} setWallet={setGuestWallet} setNotice={setNotice} />
  }

  if (page === 'Governance') {
    return <GovernancePanel setNotice={setNotice} />
  }

  return null
}

function AuthScreen({ mode, onMode, onSuccess, onClose }) {
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)

    try {
      const payload = mode === 'login'
        ? { identifier: form.email, password: form.password }
        : form

      const data = await request(mode === 'login' ? 'login' : 'register', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      localStorage.setItem('shadownet_token', data.token)
      onSuccess(data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-visual">
        <Brand />
        <div className="auth-copy">
          <span className="eyebrow">DECENTRALIZED DIGITAL IMMUNE SYSTEM</span>
          <h1>Threats leave a trace.</h1>
          <p>Deploy isolated agents, capture real attacker behavior, and turn verified signals into a shared defense layer.</p>
        </div>
        <div className="signal-line"><span /> NETWORK / NOMINAL</div>
      </div>

      <form className="auth-card" onSubmit={onSubmit}>
        <button type="button" className="auth-close" onClick={onClose}>x CLOSE</button>
        <span className="eyebrow">OPERATOR ACCESS / 01</span>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your operator key'}</h2>
        <p className="form-copy">{mode === 'login' ? 'Resume your security operation.' : 'Create a sandboxed operator account and start provisioning.'}</p>

        {mode === 'signup' && (
          <>
            <Field label="USERNAME" value={form.username} onChange={(value) => setForm((current) => ({ ...current, username: value }))} placeholder="operator_01" />
            <Field label="EMAIL" type="email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} placeholder="you@domain.com" />
          </>
        )}

        {mode === 'login' && (
          <Field label="EMAIL OR USERNAME" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} placeholder="operator_01" />
        )}

        <Field label="PASSWORD" type="password" value={form.password} onChange={(value) => setForm((current) => ({ ...current, password: value }))} placeholder="8+ characters" />

        <p className="form-error">{error}</p>

        <button type="submit" className="primary wide" disabled={busy}>
          {busy ? 'AUTHENTICATING...' : mode === 'login' ? 'ENTER COMMAND CENTER -&gt;' : 'CREATE ACCOUNT -&gt;'}
        </button>

        <button type="button" className="text-button" onClick={() => onMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'New operator? Create an account' : 'Already registered? Log in'}
        </button>
      </form>
    </div>
  )
}

function Landing({ onAuth }) {
  return (
    <div className="landing-home">
      <div className="grid-overlay" />

      <header className="landing-nav">
        <Brand />
        <div>
          <button type="button" className="text-button" onClick={() => onAuth('login')}>LOG IN</button>
          <button type="button" className="primary" onClick={() => onAuth('signup')}>JOIN NETWORK -&gt;</button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">PROTOCOL / 0.9.1 / LIVE SANDBOX</span>
          <h1>A digital immune <em>system for Web3.</em></h1>
          <p>ShadowNet lets security operators deploy autonomous agents, capture real attacker behavior, and turn verified signals into reusable defense intelligence.</p>

          <div className="hero-actions">
            <button type="button" className="primary" onClick={() => onAuth('signup')}>DEPLOY YOUR FIRST AGENT -&gt;</button>
            <button type="button" className="outline" onClick={() => onAuth('login')}>OPERATOR LOGIN</button>
          </div>
        </div>

        <div className="hero-visual">
          <div className="pulse-ring pulse-1" />
          <div className="pulse-ring pulse-2" />
          <div className="hero-console">
            <div className="console-header">
              <span />
              <span />
              <span />
            </div>
            <div className="console-body">
              <code>
                <span className="token-var">node</span> deploy-agent --role prey
                <br />
                <span className="token-key">status</span>: online
                <br />
                <span className="token-key">capture</span>: 18.4k probes / hr
                <br />
                <span className="token-key">latency</span>: 42ms
              </code>
            </div>
          </div>
        </div>
      </section>

      <section className="feature-grid">
        <InfoCard title="Real honeypots. Zero real funds." copy="Prey agents run decoy services inside a sandbox. Every connection is logged and attributable." />
        <InfoCard title="Signals become shared immunity." copy="Novelty checks, reputation, and external validation keep the network useful and anti-gaming." />
        <InfoCard title="From finding to antibody." copy="Turn verified threat intelligence into defense modules operators can reuse across the network." />
      </section>
    </div>
  )
}

function Field({ label, type = 'text', value, onChange, placeholder }) {
  return (
    <label className="field-label">
      {label}
      <input
        required
        minLength={type === 'password' ? 8 : undefined}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

function Brand() {
  return <div className="brand"><img src="/shadownet-logo.svg" alt="ShadowNet" /> <span>SHADOWNET</span></div>
}

function Panel({ title, kicker, action, onAction, children, className = '' }) {
  return (
    <div className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <span className="eyebrow">{kicker}</span>
          <h3>{title}</h3>
        </div>
        {action && (
          <button type="button" className="link-button" onClick={onAction}>{action} -&gt;</button>
        )}
      </div>
      {children}
    </div>
  )
}

function PageIntro({ title, kicker, intro }) {
  return (
    <section className="page-intro">
      <span className="eyebrow">{kicker}</span>
      <h2>{title}</h2>
      <p>{intro}</p>
    </section>
  )
}

function ConfigPanel({ title, kicker, fields, values, setValues }) {
  return (
    <section className="config-panel">
      <div className="panel-head"><div><span className="eyebrow">{kicker}</span><h3>{title}</h3></div><span className="scope-badge">AUTHORIZED SCOPE</span></div>
      <div className="config-fields">
        {fields.map(([key, label]) => (
          <label className="config-field" key={key}>{label}<input value={values[key] || ''} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} /></label>
        ))}
      </div>
      <div className="config-foot"><span>CONFIGURATION VALIDATION</span><strong><i /> READY TO PROVISION</strong></div>
    </section>
  )
}

function PreyCard({ agent, findings }) {
  const config = typeof agent.config === 'string' ? (() => { try { return JSON.parse(agent.config) } catch { return {} } })() : (agent.config || {})
  return (
    <article className="prey-card">
      <div className="card-head"><span className="agent-icon">P</span><span className="status"><i /> {agent.status}</span></div>
      <h3>{agent.name}</h3><p>{config.os || config.profile || 'Configured isolated server'} / {config.hostname || 'shadow-endpoint'}</p>
      <div className="prey-facts"><span><b>SERVICES</b>{config.services || 'SSH, HTTP'}</span><span><b>OPEN PORTS</b>{config.ports || '8081, 8082'}</span><span><b>FINDINGS</b>{findings.filter((item) => item.agent_id === agent.id).length}</span><span><b>DEPLOYED</b>{thenAgo(agent.created_at)}</span></div>
      <div className="prey-lock">ISOLATED TARGET / AUTHORIZED PREDATORS ONLY</div>
    </article>
  )
}

function InfoCard({ title, copy }) {
  return (
    <article className="info-card">
      <span className="number">S</span>
      <h3>{title}</h3>
      <p>{copy}</p>
    </article>
  )
}

function EmptyState({ title, copy, button, onClick }) {
  return (
    <div className="empty-state">
      <span>O</span>
      <h3>{title}</h3>
      <p>{copy}</p>
      {button && <button type="button" className="outline" onClick={onClick}>{button}</button>}
    </div>
  )
}

function Stat({ label, value, delta }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{delta}</small>
    </div>
  )
}

function AgentRow({ agent, onAction, busy }) {
  return (
    <div className="agent-row">
      <span className={`agent-icon ${agent.type.toLowerCase()}`}>{agent.type[0]}</span>
      <div>
        <strong>{agent.name}</strong>
        <small>{agent.type} / {agent.status}</small>
      </div>
      <span className={`status ${agent.status.toLowerCase()}`}><i /> {agent.status}</span>
      <button type="button" className="row-button" disabled={busy} onClick={() => onAction(agent, agent.status === 'ONLINE' ? 'stop' : 'start')}>
        {busy ? 'WORKING...' : agent.status === 'ONLINE' ? 'STOP' : 'START'}
      </button>
    </div>
  )
}

function AgentRuntime({ agent }) {
  const active = agent.status === 'ONLINE'

  return (
    <div className={active ? 'agent-runtime active' : 'agent-runtime paused'}>
      <div className="runtime-orbit">
        <span />
        <i />
      </div>
      <div className="runtime-graph" aria-hidden="true">
        {Array.from({ length: 14 }, (_, index) => <i key={index} style={{ '--bar-delay': `${index * 0.08}s`, '--bar-height': `${24 + ((index * 19) % 60)}%` }} />)}
      </div>
      <div className="runtime-label">
        <span>RUNTIME STREAM</span>
        <strong>{active ? 'PACKETS FLOWING' : 'STREAM PAUSED'}</strong>
      </div>
    </div>
  )
}

function FindingRow({ item }) {
  return (
    <div className="finding-row">
      <span className="severity" />
      <div>
        <strong>{item.kind}</strong>
        <small>{item.path} · {item.ip}</small>
      </div>
      <time>{thenAgo(item.created_at)}</time>
    </div>
  )
}

function PredatorConsole({ agents, honeypots, scan, onScan }) {
  const predators = agents.filter((agent) => agent.type === 'Predator' && agent.status === 'ONLINE')
  const [predatorId, setPredatorId] = useState('')
  const [honeypotId, setHoneypotId] = useState('')

  useEffect(() => {
    if (!predatorId && predators[0]) setPredatorId(predators[0].id)
    if (!honeypotId && honeypots[0]) setHoneypotId(honeypots[0].id)
  }, [predators, honeypots, predatorId, honeypotId])

  return (
    <section className="predator-console">
      <div className="scanner-head">
        <div>
          <span className="eyebrow">AUTHORIZED TARGET LINK</span>
          <h3>Predator mission control</h3>
        </div>
        <span className="scope-badge">SHADOW SCOPE ONLY</span>
      </div>
      <div className="mission-grid">
        <label>Predator agent<select value={predatorId} onChange={(event) => setPredatorId(event.target.value)}><option value="">Select Predator</option>{predators.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
        <label>Honeypot target<select value={honeypotId} onChange={(event) => setHoneypotId(event.target.value)}><option value="">Select honeypot</option>{honeypots.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} / {agent.config?.profile || 'decoy'}</option>)}</select></label>
        <button type="button" className="primary" disabled={!predatorId || !honeypotId || scan?.state === 'scanning'} onClick={() => onScan(predatorId, honeypotId)}>{scan?.state === 'scanning' ? 'SCANNING TARGET...' : 'RUN SAFE SCAN -&gt;'}</button>
      </div>
      <div className="mission-evidence">
        <span className="scope-lock">LOCKED SCOPE</span>
        <span>Ports / services / configuration signals</span>
        <span>{scan?.state === 'complete' ? `${scan.data.findings.length} findings published` : 'No mission run yet'}</span>
      </div>
    </section>
  )
}

function PortScanner({ results, scanning, onScan }) {
  const openPorts = results.filter((item) => item.status === 'open')

  return (
    <section className={scanning ? 'port-scanner scanning' : 'port-scanner'}>
      <div className="scanner-head">
        <div>
          <span className="eyebrow">LOCAL DIAGNOSTICS / SAFE SCOPE</span>
          <h3>Port scanner</h3>
        </div>
        <button type="button" className="primary" onClick={onScan} disabled={scanning}>{scanning ? 'SCANNING...' : 'SCAN LOCALHOST -&gt;'}</button>
      </div>
      <div className="scanner-radar"><span /><i /><b>127.0.0.1</b></div>
      <div className="scanner-output">
        {results.length ? (
          results.map((item) => (
            <div className={item.status === 'open' ? 'port-row open' : 'port-row'} key={item.port}>
              <span className="port-state" />
              <strong>:{item.port}</strong>
              <span>{item.service}</span>
              <b>{item.status.toUpperCase()}</b>
            </div>
          ))
        ) : (
          <div className="scanner-empty">READY / localhost only / no external targets</div>
        )}
      </div>
      <footer>{openPorts.length ? `${openPorts.length} open service${openPorts.length === 1 ? '' : 's'} detected` : 'Scan evidence appears here'}</footer>
    </section>
  )
}

function WalletPicker({ user, wallet, setWallet, setNotice }) {
  const [open, setOpen] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [addressInput, setAddressInput] = useState('')
  const currentWallet = user?.wallet || wallet
  const wallets = [
    { id: 'metamask', name: 'MetaMask', mark: 'M', color: '#f6851b' },
    { id: 'coinbase', name: 'Coinbase Wallet', mark: 'C', color: '#4d73f8' },
    { id: 'phantom', name: 'Phantom', mark: 'P', color: '#ab9cff' },
    { id: 'walletconnect', name: 'WalletConnect', mark: 'W', color: '#5d8bff' },
  ]

  const connect = async (selected) => {
    setConnecting(true)
    try {
      let address = ''
      if (window.ethereum && ['metamask', 'coinbase', 'phantom'].includes(selected.id)) {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
        address = accounts[0] || ''
      }

      if (!address) address = addressInput.trim()
      if (!address) throw new Error('Enter your wallet address or install the provider extension.')
      if (!/^0x[a-fA-F0-9]{40}$/.test(address) && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new Error('Enter a valid Ethereum or Solana wallet address.')

      setWallet(address)
      localStorage.setItem('shadownet_guest_wallet', address)
      if (user) await request('wallet', { method: 'POST', body: JSON.stringify({ wallet: address }) })
      setNotice(`${selected.name} connected`)
      setAddressInput('')
      setOpen(false)
    } catch (error) {
      setNotice(error.message || 'Wallet connection was cancelled')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="wallet-picker">
      <button type="button" className="wallet-button" onClick={() => setOpen((current) => !current)}>
        <span className="wallet-mark" style={{ background: currentWallet ? 'var(--lime)' : 'var(--cyan)' }}>{currentWallet ? '✓' : '+'}</span>
        {currentWallet ? `${currentWallet.slice(0, 6)}...${currentWallet.slice(-4)}` : 'CONNECT WALLET'} <b>-&gt;</b>
      </button>
      {open && (
        <div className="wallet-menu">
          <div className="wallet-menu-head">
            <span className="eyebrow">SELECT PROVIDER</span>
            <button type="button" onClick={() => setOpen(false)}>x</button>
          </div>
          {wallets.map((item) => (
            <button type="button" className="wallet-option" key={item.id} onClick={() => connect(item)} disabled={connecting}>
              <span className="provider-mark" style={{ background: item.color }}>{item.mark}</span>
              <span><strong>{item.name}</strong><small>{item.id === 'walletconnect' ? 'QR connection' : 'Browser extension'}</small></span>
              <b>-&gt;</b>
            </button>
          ))}
          <label className="wallet-address-field">WALLET ADDRESS<input value={addressInput} onChange={(event) => setAddressInput(event.target.value)} placeholder="0x... or Solana address" /></label>
          <small className="wallet-note">No custody. No seed phrases stored.</small>
        </div>
      )}
    </div>
  )
}

function ProfileCard({ user, wallet, setWallet, setNotice }) {
  const handleWallet = async () => {
    setNotice('Use the wallet selector in the top bar to choose a provider')
  }

  return (
    <>
      <PageIntro title="Operator profile" kicker="IDENTITY / 06" intro="Manage your account identity and optional wallet link." />

      <div className="profile-box panel">
        <div className="profile-avatar">{user ? user.username[0].toUpperCase() : 'G'}</div>
        <div>
          <span className="eyebrow">OPERATOR ID</span>
          <h2>{user ? user.username : 'Open operator'}</h2>
          <p>{user ? user.email : 'Public access / live operator mode'}</p>
        </div>
        <button type="button" className="outline" onClick={handleWallet}>{user?.wallet || wallet ? 'WALLET LINKED' : 'CONNECT WALLET'}</button>
      </div>

      <div className="panel security-note">
        <span className="eyebrow">SECURITY MODEL</span>
        <h3>PBKDF2-SHA256 + expiring sessions</h3>
        <p>Your password is salted and derived server-side. Wallets are optional identity links and never custody user funds.</p>
      </div>
    </>
  )
}

function GovernancePanel({ setNotice }) {
  const [proposals, setProposals] = useState([])
  const [reviewing, setReviewing] = useState(null)
  const [voting, setVoting] = useState(null)

  useEffect(() => {
    request('proposals').then((data) => setProposals(data.proposals || [])).catch(() => {})
  }, [])

  const vote = async (proposal, choice) => {
    setVoting(`${proposal.id}:${choice}`)
    try {
      const data = await request(`proposals/${proposal.id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ vote: choice }),
      })
      setProposals((current) => current.map((item) => item.id === proposal.id ? data.proposal : item))
      setReviewing(null)
      setNotice(`Vote recorded: ${choice.toUpperCase()} on ${proposal.title}`)
    } catch (error) {
      setNotice(error.message)
    } finally {
      setVoting(null)
    }
  }

  return (
    <>
      <PageIntro title="Governance" kicker="COLLECTIVE DEFENSE / 07" intro="Operators steer the protocol through transparent proposals and recorded votes." />

      <div className="proposal-list">
        {proposals.map((proposal) => {
          const total = proposal.yes + proposal.no
          const percent = total ? Math.round((proposal.yes / total) * 100) : 0

          return (
            <article className="proposal-card panel" key={proposal.id}>
              <div>
                <span className="status active"><i /> {proposal.status}</span>
                <h3>{proposal.title}</h3>
                <p>{proposal.description}</p>
              </div>

              <div className="vote-box">
                <strong>{percent}%</strong>
                <small>YES SUPPORT</small>
                <div className="vote-bar"><span style={{ width: `${percent}%` }} /></div>
                {reviewing === proposal.id ? (
                  <div className="vote-actions">
                    <button type="button" className="vote-yes" disabled={Boolean(voting)} onClick={() => vote(proposal, 'yes')}>{voting === `${proposal.id}:yes` ? 'RECORDING...' : 'VOTE YES'}</button>
                    <button type="button" className="vote-no" disabled={Boolean(voting)} onClick={() => vote(proposal, 'no')}>{voting === `${proposal.id}:no` ? 'RECORDING...' : 'VOTE NO'}</button>
                    <button type="button" className="vote-cancel" onClick={() => setReviewing(null)}>CANCEL</button>
                  </div>
                ) : (
                  <button type="button" className="outline" onClick={() => setReviewing(proposal.id)}>REVIEW &amp; VOTE</button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </>
  )
}

export default App
