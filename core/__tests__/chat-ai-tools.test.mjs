import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { __testing, clearTokenUsage } from '../server/lib/chat.mjs';

const { callAi } = __testing;

const originalFetch = global.fetch;

beforeAll(() => clearTokenUsage());
afterAll(() => {
  global.fetch = originalFetch;
  clearTokenUsage();
});

function jsonResponse(obj) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => obj,
  };
}

describe('callAi tool loop', () => {
  it('returns the plain reply when no tools are provided (single shot)', async () => {
    global.fetch = async () => jsonResponse({
      choices: [{ message: { role: 'assistant', content: 'hello' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
    const reply = await callAi(
      { model: 'gpt-4o-mini', apiUrl: 'http://mock/v1', apiKey: 'k', temperature: 0.7 },
      ['You are helpful.', 'hi'],
    );
    expect(reply).toBe('hello');
  });

  it('executes tool_calls and feeds results back until the model answers', async () => {
    const requests = [];
    global.fetch = async (_url, opts) => {
      const body = JSON.parse(opts.body);
      requests.push(body);
      if (requests.length === 1) {
        return jsonResponse({
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'c1', type: 'function', function: { name: 'mcp__svc__tool', arguments: '{"x":1}' } }],
            },
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        });
      }
      return jsonResponse({
        choices: [{ message: { role: 'assistant', content: 'done' } }],
        usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 },
      });
    };

    const executed = [];
    const reply = await callAi(
      { model: 'gpt-4o-mini', apiUrl: 'http://mock/v1', apiKey: 'k', temperature: 0.7 },
      ['You are helpful.', 'hi'],
      {
        tools: [{ type: 'function', function: { name: 'mcp__svc__tool', parameters: { type: 'object' } } }],
        executeTool: async (name, args) => { executed.push([name, args]); return '{"ok":true}'; },
      },
    );

    expect(reply).toBe('done');
    expect(executed).toEqual([['mcp__svc__tool', { x: 1 }]]);
    expect(requests).toHaveLength(2);
    expect(requests[0].tools).toHaveLength(1);
    expect(requests[0].tool_choice).toBe('auto');
    const toolMessage = requests[1].messages.find((m) => m.role === 'tool');
    expect(toolMessage.tool_call_id).toBe('c1');
    expect(toolMessage.content).toBe('{"ok":true}');
  });

  it('converts tool execution errors into a tool result instead of aborting', async () => {
    let n = 0;
    global.fetch = async () => {
      n += 1;
      if (n === 1) {
        return jsonResponse({
          choices: [{
            message: { role: 'assistant', content: null, tool_calls: [{ id: 'c2', type: 'function', function: { name: 'boom', arguments: '{}' } }] },
          }],
          usage: {},
        });
      }
      return jsonResponse({
        choices: [{ message: { role: 'assistant', content: 'recovered' } }],
        usage: {},
      });
    };
    const reply = await callAi(
      { model: 'gpt-4o-mini', apiUrl: 'http://mock/v1', apiKey: 'k', temperature: 0.7 },
      ['You are helpful.', 'hi'],
      { tools: [{ type: 'function', function: { name: 'boom', parameters: { type: 'object' } } }], executeTool: async () => { throw new Error('kaput'); } },
    );
    expect(reply).toBe('recovered');
  });
});
