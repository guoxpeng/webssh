import { describe, it, expect } from 'vitest';
import { encodeInstruction, parseInstructions } from '../server/lib/guacd.mjs';

describe('guacd instruction framing', () => {
  it('encodes opcode and args with length prefixes', () => {
    expect(encodeInstruction('select', ['rdp'])).toBe('6.select,3.rdp;');
    expect(encodeInstruction('size', ['1280', '800', '96'])).toBe('4.size,4.1280,3.800,2.96;');
    expect(encodeInstruction('video', [])).toBe('5.video;');
  });

  it('roundtrips through the parser', () => {
    const encoded = encodeInstruction('connect', ['1.2.3.4', '3389', '用户', 'p;w']);
    const { instructions, rest } = parseInstructions(encoded);
    expect(rest).toBe('');
    expect(instructions).toHaveLength(1);
    expect(instructions[0]).toEqual(['connect', '1.2.3.4', '3389', '用户', 'p;w']);
  });

  it('parses multiple instructions in one chunk', () => {
    const text = encodeInstruction('ready', ['conn-1']) + encodeInstruction('sync', ['123']);
    const { instructions, rest } = parseInstructions(text);
    expect(rest).toBe('');
    expect(instructions).toHaveLength(2);
    expect(instructions[0][0]).toBe('ready');
    expect(instructions[1][0]).toBe('sync');
  });

  it('keeps incomplete trailing data for the next chunk', () => {
    const full = encodeInstruction('blob', ['a'.repeat(50)]);
    const partial = full.slice(0, 12);
    const first = parseInstructions(partial);
    expect(first.instructions).toHaveLength(0);
    expect(first.rest).toBe(partial);
    // Feed the rest — now it completes.
    const second = parseInstructions(first.rest + full.slice(12));
    expect(second.instructions).toHaveLength(1);
    expect(second.instructions[0][1]).toBe('a'.repeat(50));
    expect(second.rest).toBe('');
  });

  it('handles empty values', () => {
    const { instructions } = parseInstructions(encodeInstruction('args', ['', 'x', '']));
    expect(instructions[0]).toEqual(['args', '', 'x', '']);
  });
});
