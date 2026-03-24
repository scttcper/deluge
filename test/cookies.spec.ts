import { expect, it } from 'vitest';

import { Deluge } from '../src/index.js';

const baseUrl = 'http://localhost:8112';

it('should build a request cookie header from the auth set-cookie header', () => {
  const deluge = new Deluge({ baseUrl });
  (deluge as any)._setAuthCookie(
    'session_id=abc123; expires=Wed, 09 Jun 2027 10:18:14 GMT; HttpOnly',
  );

  expect(deluge.state.auth.cookieHeader).toBe('session_id=abc123');
});

it('should preserve the auth cookie expiration from set-cookie', () => {
  const deluge = new Deluge({ baseUrl });
  (deluge as any)._setAuthCookie(
    'session_id=abc123; expires=Wed, 09 Jun 2027 10:18:14 GMT; HttpOnly',
  );

  expect(deluge.state.auth.expires).toBe('2027-06-09T10:18:14.000Z');
});

it('should preserve auth cookie state across export and restore', () => {
  const deluge = new Deluge({ baseUrl });
  deluge.state.auth = {
    cookieHeader: 'session_id=abc123',
    expires: '2027-06-09T10:18:14.000Z',
    msgId: 7,
  };

  const restored = Deluge.createFromState(deluge.config, deluge.exportState());
  expect(restored.state.auth).toEqual(deluge.state.auth);
});
