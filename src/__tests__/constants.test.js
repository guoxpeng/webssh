import { describe, it, expect } from 'vitest';
import { ConnectionStatus, AuthType, SESSION_STORAGE_CRED_PREFIX } from '../utils/constants.js';

describe('constants', () => {
  it('ConnectionStatus is frozen', () => {
    expect(Object.isFrozen(ConnectionStatus)).toBe(true);
  });

  it('ConnectionStatus has correct values', () => {
    expect(ConnectionStatus.DISCONNECTED).toBe('disconnected');
    expect(ConnectionStatus.CONNECTING).toBe('connecting');
    expect(ConnectionStatus.CONNECTED).toBe('connected');
    expect(ConnectionStatus.ERROR).toBe('error');
  });

  it('AuthType is frozen with correct values', () => {
    expect(Object.isFrozen(AuthType)).toBe(true);
    expect(AuthType.PASSWORD).toBe('password');
    expect(AuthType.KEY).toBe('key');
  });

  it('SESSION_STORAGE_CRED_PREFIX is defined', () => {
    expect(SESSION_STORAGE_CRED_PREFIX).toBe('sshWebAppCred_');
  });
});
