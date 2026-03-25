import { describe, it, expect } from 'vitest';
import { sanitize } from '../lib/sanitize.js';

describe('sanitize', () => {
  it('strips angle brackets', () => {
    expect(sanitize('<script>alert("xss")</script>')).toBe('scriptalert(xss)/script');
  });

  it('strips quotes and ampersands', () => {
    expect(sanitize('O\'Brien & "Associates"')).toBe('OBrien  Associates');
  });

  it('trims whitespace', () => {
    expect(sanitize('  hello  ')).toBe('hello');
  });

  it('passes through non-strings', () => {
    expect(sanitize(42)).toBe(42);
    expect(sanitize(null)).toBe(null);
    expect(sanitize(undefined)).toBe(undefined);
  });

  it('handles empty string', () => {
    expect(sanitize('')).toBe('');
  });
});
