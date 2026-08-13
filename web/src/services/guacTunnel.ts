// Custom Guacamole tunnel for the webssh /ws/guacd bridge.
//
// The guacd handshake (select/args/connect) is done SERVER-side — the browser
// only exchanges already-framed Guacamole instructions after sending its JSON
// connection config as the first WebSocket message. Credentials therefore
// travel over the authenticated WebSocket, never in a URL.
import Guacamole from 'guacamole-common-js';
import { wsAuthProtocols, withLegacyToken, getGuacWsUrl } from '@/utils/constants';

interface GuacInstruction {
  opcode: string;
  args: string[];
}

// Incremental parser for length-prefixed Guacamole instructions
// ("3.key,5.65507,1.1;"). One WebSocket message may hold several instructions.
function parseInstructions(text: string): { instructions: GuacInstruction[]; rest: string } {
  const instructions: GuacInstruction[] = [];
  let pos = 0;
  while (pos < text.length) {
    const args: string[] = [];
    let cur = pos;
    let complete = false;
    while (cur < text.length) {
      const dot = text.indexOf('.', cur);
      if (dot === -1) break;
      const lenStr = text.slice(cur, dot);
      if (!/^\d+$/.test(lenStr)) { cur = text.length; break; }
      const len = parseInt(lenStr, 10);
      const valueStart = dot + 1;
      const valueEnd = valueStart + len;
      if (valueEnd > text.length) break;
      args.push(text.slice(valueStart, valueEnd));
      const delim = text[valueEnd];
      if (delim === ',') { cur = valueEnd + 1; continue; }
      if (delim === ';') { cur = valueEnd + 1; complete = true; break; }
      cur = text.length;
      break;
    }
    if (!complete) return { instructions, rest: text.slice(pos) };
    if (args.length) instructions.push({ opcode: args[0], args: args.slice(1) });
    pos = cur;
  }
  return { instructions, rest: '' };
}

export function createGuacTunnel(config: Record<string, unknown>): any {
  // Inherit the base tunnel (uuid / state machinery), then override transport.
  const tunnel: any = new (Guacamole as any).Tunnel();
  let ws: WebSocket | null = null;
  let buffer = '';
  let opened = false;
  let legacyRetried = false;

  function setState(state: number) { try { tunnel.setState(state); } catch {} }

  function openSocket(legacyAuth: boolean) {
    const protocols = legacyAuth ? undefined : wsAuthProtocols();
    const url = legacyAuth ? withLegacyToken(getGuacWsUrl()) : getGuacWsUrl();
    try {
      ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
    } catch (e) {
      if (tunnel.onerror) tunnel.onerror(e);
      return;
    }
    ws.onopen = () => {
      opened = true;
      // First message = JSON connection config; the server does the guacd
      // handshake and replies {"type":"guac_ready"} when the session is up.
      try { ws!.send(JSON.stringify(config)); } catch {}
    };
    ws.onmessage = (event) => {
      const data = event.data;
      if (typeof data !== 'string') return;
      if (data.startsWith('{"type":"guac_ready"')) {
        setState((Guacamole as any).Tunnel.State.OPEN);
        return;
      }
      if (data.startsWith('{"type":"error"')) {
        let message = 'Remote desktop error';
        try { message = JSON.parse(data).message || message; } catch {}
        if (tunnel.onerror) tunnel.onerror(new (Guacamole as any).Status(1000, message));
        return;
      }
      buffer += data;
      const { instructions, rest } = parseInstructions(buffer);
      buffer = rest;
      for (const inst of instructions) {
        if (tunnel.oninstruction) tunnel.oninstruction(inst.opcode, inst.args);
      }
    };
    ws.onclose = (event) => {
      if (!opened && !legacyAuth && !legacyRetried) {
        legacyRetried = true;
        openSocket(true);
        return;
      }
      setState((Guacamole as any).Tunnel.State.CLOSED);
      if (tunnel.onerror && !event.wasClean) {
        tunnel.onerror(new (Guacamole as any).Status(1006, 'Connection closed'));
      }
    };
    ws.onerror = () => {
      if (!opened && !legacyAuth && !legacyRetried) return;
      if (tunnel.onerror) tunnel.onerror(new (Guacamole as any).Status(1006, 'WebSocket error'));
    };
  }

  tunnel.connect = () => {
    setState((Guacamole as any).Tunnel.State.CONNECTING);
    openSocket(false);
  };

  tunnel.disconnect = () => {
    try { ws?.close(1000); } catch {}
    ws = null;
  };

  // Client calls sendMessage(opcode, ...args); frame as one instruction.
  tunnel.sendMessage = (...elements: (string | number)[]) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    let out = '';
    for (const el of elements) {
      const s = String(el ?? '');
      out += (out ? ',' : '') + `${s.length}.${s}`;
    }
    try { ws.send(out + ';'); } catch {}
  };

  return tunnel;
}
