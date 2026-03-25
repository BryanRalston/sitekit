import { describe, it, expect } from 'vitest';
import { getItemStatus } from '../tokens.js';

describe('getItemStatus', () => {
  it('returns "pending" for new items', () => {
    expect(getItemStatus({ qtyOrdered: '10', qtyReceived: '' })).toBe('pending');
  });

  it('returns "received" when qty received >= ordered', () => {
    expect(getItemStatus({ qtyOrdered: '10', qtyReceived: '10' })).toBe('received');
    expect(getItemStatus({ qtyOrdered: '10', qtyReceived: '15' })).toBe('received');
  });

  it('returns "partial" when some received but not all', () => {
    expect(getItemStatus({ qtyOrdered: '10', qtyReceived: '5' })).toBe('partial');
  });

  it('returns "issue" when damaged', () => {
    expect(getItemStatus({ damaged: true, qtyOrdered: '10', qtyReceived: '10' })).toBe('issue');
  });

  it('returns "issue" when missing parts', () => {
    expect(getItemStatus({ missingParts: 'shelf bracket missing', qtyOrdered: '10', qtyReceived: '' })).toBe('issue');
  });

  it('returns "overdue" when delivery date is past and nothing received', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    expect(getItemStatus({ delDate: yesterday, qtyOrdered: '10', qtyReceived: '' })).toBe('overdue');
  });

  it('does not return overdue when items are received', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    expect(getItemStatus({ delDate: yesterday, qtyOrdered: '10', qtyReceived: '10' })).toBe('received');
  });

  it('handles missing fields gracefully', () => {
    expect(getItemStatus({})).toBe('pending');
    expect(getItemStatus({ qtyOrdered: '', qtyReceived: '' })).toBe('pending');
  });
});
