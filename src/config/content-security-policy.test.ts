import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, contentSecurityPolicyMetaTag } from './content-security-policy';

function directivesOf(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(';').map((entry) => {
      const [name = '', ...sources] = entry.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

describe('buildContentSecurityPolicy', () => {
  it('locks down plugins, frames, base and form targets', () => {
    const directives = directivesOf(buildContentSecurityPolicy());

    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('frame-src')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'none'"]);
    expect(directives.get('form-action')).toEqual(["'none'"]);
    expect(directives.get('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(directives.get('script-src')).not.toContain("'unsafe-inline'");
    expect(directives.get('script-src')).not.toContain("'unsafe-eval'");
    expect(directives.get('media-src')).toEqual(["'self'", 'blob:']);
    expect(directives.get('worker-src')).toEqual(["'self'", 'blob:']);
  });

  it('allows the api and socket over http and websocket plus the configured origins', () => {
    const directives = directivesOf(
      buildContentSecurityPolicy({
        apiUrl: 'https://api.test/base',
        socketUrl: 'https://socket.test',
        mediaOrigin: 'https://media.test/bucket',
        translationModelsUrl: 'https://models.test/v1/',
        scriptHashes: ['sha256-abc='],
      }),
    );

    expect(directives.get('connect-src')).toEqual([
      "'self'",
      'blob:',
      'https://api.test',
      'wss://api.test',
      'https://socket.test',
      'wss://socket.test',
      'https://media.test',
      'https://models.test',
    ]);
    expect(directives.get('script-src')).toContain("'sha256-abc='");
  });

  it('falls back to any https origin for media when none is configured', () => {
    const directives = directivesOf(buildContentSecurityPolicy({ apiUrl: 'http://localhost:3001', socketUrl: 'http://localhost:3001' }));

    expect(directives.get('connect-src')).toEqual(["'self'", 'blob:', 'http://localhost:3001', 'ws://localhost:3001', 'https:']);
  });

  it('ignores values that are not http origins', () => {
    const directives = directivesOf(buildContentSecurityPolicy({ apiUrl: 'javascript:alert(1)', mediaOrigin: 'not a url' }));

    expect(directives.get('connect-src')).toEqual(["'self'", 'blob:', 'https:']);
  });

  it('renders an escaped meta tag', () => {
    expect(contentSecurityPolicyMetaTag("default-src 'self'")).toBe(`<meta http-equiv="Content-Security-Policy" content="default-src 'self'" />`);
  });

  it('only opens connect-src to the key transparency witness when one is configured', () => {
    const without = directivesOf(buildContentSecurityPolicy({ apiUrl: 'https://api.test' })).get('connect-src');
    const withWitness = directivesOf(
      buildContentSecurityPolicy({ apiUrl: 'https://api.test', keyTransparencyWitnessUrl: 'https://owner.github.io/witness/head.json' }),
    ).get('connect-src');

    expect(without).not.toContain('https://owner.github.io');
    expect(withWitness).toContain('https://owner.github.io');
    expect(withWitness?.filter((source) => source.startsWith('http')).length).toBe((without ?? []).filter((source) => source.startsWith('http')).length + 1);
  });

  it('ignores an invalid witness url', () => {
    const policy = buildContentSecurityPolicy({ apiUrl: 'https://api.test', keyTransparencyWitnessUrl: 'javascript:alert(1)' });
    expect(policy).not.toContain('javascript');
    expect(policy).toBe(buildContentSecurityPolicy({ apiUrl: 'https://api.test' }));
  });
});
