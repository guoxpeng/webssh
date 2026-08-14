import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';
import { collectMcpTools, formatToolResult, sanitizeMcpName } from '../server/lib/mcp-client.mjs';

const MCP_SERVER_PATH = fileURLToPath(new URL('../mcp/server.mjs', import.meta.url));

describe('sanitizeMcpName', () => {
  it('replaces spaces and special chars with underscores', () => {
    expect(sanitizeMcpName('My Server!')).toBe('My_Server');
    expect(sanitizeMcpName('  ')).toBe('mcp');
    expect(sanitizeMcpName('foo-bar')).toBe('foo-bar');
  });

  it('collapses runs of underscores', () => {
    expect(sanitizeMcpName('a  b')).toBe('a_b');
  });
});

describe('formatToolResult', () => {
  it('joins text content blocks', () => {
    expect(formatToolResult({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe('a\nb');
  });

  it('stringifies structuredContent', () => {
    expect(formatToolResult({ structuredContent: { ok: true } })).toBe('{\n  "ok": true\n}');
  });

  it('passes through plain strings', () => {
    expect(formatToolResult('hello')).toBe('hello');
  });

  it('handles image blocks', () => {
    expect(formatToolResult({ content: [{ type: 'image', data: 'x' }] })).toBe('[image]');
  });
});

describe('collectMcpTools', () => {
  it('registers tools under the mcp__<service>__<tool> namespace', async () => {
    const collected = await collectMcpTools([
      { id: '1', name: 'self', transport: 'stdio', command: 'node', args: [MCP_SERVER_PATH], env: { WEBSSH_TOKEN: 'x' }, enabled: true },
    ]);
    try {
      expect(collected.tools).toHaveLength(5);
      const names = collected.tools.map((t) => t.function.name);
      expect(names).toContain('mcp__self__webssh_exec_command');
      expect(collected.registry.has('mcp__self__webssh_exec_command')).toBe(true);
    } finally {
      collected.close();
    }
  });

  it('skips disabled clients', async () => {
    const collected = await collectMcpTools([
      { id: '1', name: 'self', transport: 'stdio', command: 'node', args: [MCP_SERVER_PATH], enabled: false },
    ]);
    expect(collected.tools).toHaveLength(0);
    collected.close();
  });
});
