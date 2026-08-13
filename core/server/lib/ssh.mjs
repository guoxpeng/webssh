import { Client } from 'ssh2';
import { makeSSHConfig, setupSSHClient, hashCreds } from './utils.mjs';
import { sessions } from './session.mjs';
import { logger } from './logger.mjs';

// Collects a host resource snapshot over ~1s (CPU & net rates need two samples).
// Pure /proc + POSIX tools — no agents, works on any Linux host; on non-Linux
// hosts the missing /proc sources simply leave the fields at 0.
const STATS_SCRIPT = `
cpu1=$(head -n1 /proc/stat 2>/dev/null)
rx1=$(cat /sys/class/net/*/statistics/rx_bytes 2>/dev/null | awk '{s+=$1} END{print s+0}')
tx1=$(cat /sys/class/net/*/statistics/tx_bytes 2>/dev/null | awk '{s+=$1} END{print s+0}')
sleep 1
cpu2=$(head -n1 /proc/stat 2>/dev/null)
rx2=$(cat /sys/class/net/*/statistics/rx_bytes 2>/dev/null | awk '{s+=$1} END{print s+0}')
tx2=$(cat /sys/class/net/*/statistics/tx_bytes 2>/dev/null | awk '{s+=$1} END{print s+0}')
echo "$cpu1"
echo "$cpu2"
echo "RX $rx1 $rx2"
echo "TX $tx1 $tx2"
free -b 2>/dev/null | awk '/^Mem/{print "MEM",$2,$3,$7} /^Swap/{print "SWAP",$2,$3}'
df -B1 -P / 2>/dev/null | awk 'NR==2{print "DISK",$2,$3,$5}'
awk '{print "LOAD",$1,$2,$3}' /proc/loadavg 2>/dev/null
nproc 2>/dev/null | awk '{print "CPU_N",$1}'
awk '{print "UPTIME",int($1)}' /proc/uptime 2>/dev/null
`;

// Parse the raw multi-line snapshot into a compact object for the frontend.
function parseStats(raw) {
  const out = { cpu: 0, cores: 0, memTotal: 0, memUsed: 0, memAvail: 0, swapTotal: 0, swapUsed: 0, diskTotal: 0, diskUsed: 0, diskPct: 0, rxRate: 0, txRate: 0, load: [0, 0, 0], uptime: 0 };
  const lines = String(raw).split('\n');
  let c1 = null, c2 = null, rx = null, tx = null;
  for (const line of lines) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'cpu') { if (!c1) c1 = p; else c2 = p; continue; }
    switch (p[0]) {
      case 'RX': rx = [Number(p[1]) || 0, Number(p[2]) || 0]; break;
      case 'TX': tx = [Number(p[1]) || 0, Number(p[2]) || 0]; break;
      case 'MEM': out.memTotal = +p[1] || 0; out.memUsed = +p[2] || 0; out.memAvail = +p[3] || 0; break;
      case 'SWAP': out.swapTotal = +p[1] || 0; out.swapUsed = +p[2] || 0; break;
      case 'DISK': out.diskTotal = +p[1] || 0; out.diskUsed = +p[2] || 0; out.diskPct = parseInt(p[3], 10) || 0; break;
      case 'LOAD': out.load = [+p[1] || 0, +p[2] || 0, +p[3] || 0]; break;
      case 'CPU_N': out.cores = +p[1] || 0; break;
      case 'UPTIME': out.uptime = +p[1] || 0; break;
    }
  }
  if (c1 && c2) {
    // /proc/stat cpu line: user nice system idle iowait irq softirq ...
    const idle1 = (+c1[4] || 0) + (+c1[5] || 0);
    const idle2 = (+c2[4] || 0) + (+c2[5] || 0);
    const tot1 = c1.slice(1).reduce((s, v) => s + (+v || 0), 0);
    const tot2 = c2.slice(1).reduce((s, v) => s + (+v || 0), 0);
    const dt = tot2 - tot1, di = idle2 - idle1;
    out.cpu = dt > 0 ? Math.round(((dt - di) / dt) * 1000) / 10 : 0;
  }
  if (rx) out.rxRate = Math.max(0, rx[1] - rx[0]);
  if (tx) out.txRate = Math.max(0, tx[1] - tx[0]);
  return out;
}

export function handleSSH(ws, config) {
  if (config.simulateError) {
    setTimeout(() => {
      try { ws.send('\r\n\x1b[31m[SSH Error] Connection refused: simulateError is enabled\x1b[0m\r\n'); } catch {}
      setTimeout(() => { try { ws.close(1000); } catch {} }, 1000);
    }, 1500);
    return;
  }
  const client = new Client();
  setupSSHClient(client, config.auth_value);
  const cfg = {
    ...makeSSHConfig(config),
    keepaliveInterval: 30000,
    keepaliveCountMax: 3,
  };
  const tag = `SSH ${cfg.host}:${cfg.port}`;
  const log = logger(tag);
  let sessionId = null;
  let closed = false;
  const closeAll = () => { if (closed) return; closed = true; try { client.end(); } catch {}; try { client.removeAllListeners(); } catch {}; if (sessionId && sessions.get(sessionId)?.client === client) sessions.delete(sessionId); try { ws.close(1000); } catch {}; };

  client.on('ready', () => {
    log.info('connected');
    const credHash = config.auth_value ? hashCreds(config.auth_value) : null;
    const stdKey = `${cfg.host}_${cfg.port}_${cfg.username}_${credHash || 'noauth'}`;
    sessionId = stdKey;
    if (!sessions.has(stdKey)) {
      sessions.set(stdKey, { client, host: cfg.host, port: cfg.port, username: cfg.username, credHash, createdAt: Date.now() });
    }
    client.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, stream) => {
      if (err) { log.error('shell error', err); try { ws.send('\r\n\x1b[31m[Shell Error] ' + err.message + '\x1b[0m\r\n'); } catch {} closeAll(); return; }
      try { ws.send(JSON.stringify({ type: 'ssh_ready' })); } catch {}
      // Host resource monitor (FinalShell-style): the frontend polls with
      // "stats:" messages; we exec a read-only /proc snapshot on a separate
      // channel so the interactive shell is never polluted.
      let statsBusy = false;
      const runStats = () => {
        if (statsBusy || closed) return;
        statsBusy = true;
        client.exec(STATS_SCRIPT, (err, ch) => {
          if (err) { statsBusy = false; return; }
          let out = '';
          ch.on('data', (d) => { out += d.toString(); });
          ch.stderr.on('data', () => {});
          ch.on('close', () => {
            statsBusy = false;
            try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'host_stats', data: parseStats(out) })); } catch {}
          });
          ch.on('error', () => { statsBusy = false; });
        });
      };
      const onWsMsg = (input) => {
        const str = input.toString();
        if (str.startsWith('resize:')) {
          const [_, rs, cs] = str.split(':');
          const rows = parseInt(rs, 10);
          const cols = parseInt(cs, 10);
          if (rows && cols && stream.setWindow) stream.setWindow(rows, cols);
          return;
        }
        if (str.startsWith('stats:')) { runStats(); return; }
        if (stream.writable) stream.write(str);
      };
      ws.on('message', onWsMsg);
      stream.on('data', (c) => { if (ws.readyState === 1) ws.send(c.toString()); });
      stream.stderr.on('data', (c) => { if (ws.readyState === 1) ws.send(c.toString()); });
      stream.on('error', (err) => { log.error('stream error', err); closeAll(); });
      stream.on('close', () => { log.info('shell closed'); ws.removeListener('message', onWsMsg); closeAll(); });
      ws.on('close', () => { log.debug('WS closed (SSH kept alive)'); ws.removeListener('message', onWsMsg); });
    });
  });
  client.on('error', (err) => {
    log.error('ssh error', err);
    try { ws.send('\r\n\x1b[31m[Error] ' + err.message + '\x1b[0m\r\n'); } catch {}
    setTimeout(() => closeAll(), 500);
  });
  client.on('close', () => { log.info('disconnected'); setTimeout(() => closeAll(), 100); });
  client.connect(cfg);
}
