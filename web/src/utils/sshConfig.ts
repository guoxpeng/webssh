// Minimal OpenSSH config parser — extracts host entries suitable for
// importing into the connection list. Handles the common directives
// (Host / HostName / User / Port / IdentityFile), `key value` and
// `key=value` forms, comments and wildcard hosts (skipped).

export interface ParsedSshHost {
  name: string;
  host: string;
  port: number;
  username: string;
  hasKey: boolean;
}

export function parseSshConfig(text: string): ParsedSshHost[] {
  const hosts: ParsedSshHost[] = [];
  let current: Partial<ParsedSshHost> & { wildcard?: boolean } | null = null;

  const flush = () => {
    if (current && !current.wildcard) {
      // HostName is optional in ssh config — the Host alias itself is used as
      // the address when missing (same as what ssh does via DNS).
      const host = current.host || (current.name || '');
      if (host) {
        hosts.push({
          name: current.name || host,
          host,
          port: current.port || 22,
          username: current.username || 'root',
          hasKey: !!current.hasKey,
        });
      }
    }
    current = null;
  };

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9]*)\s*[=\s]\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim().replace(/^"(.*)"$/, '$1');
    if (key === 'host') {
      flush();
      const names = value.split(/\s+/);
      const wildcard = names.some((n) => n.includes('*') || n.includes('?'));
      current = { name: names[0], wildcard };
      continue;
    }
    if (!current || current.wildcard) continue;
    switch (key) {
      case 'hostname': current.host = value.split(/\s+/)[0]; break;
      case 'user': current.username = value; break;
      case 'port': {
        const p = parseInt(value, 10);
        if (p > 0 && p <= 65535) current.port = p;
        break;
      }
      case 'identityfile': current.hasKey = true; break;
    }
  }
  flush();
  return hosts;
}
