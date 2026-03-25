import { describe, it, expect } from 'vitest';
import { parsePdfText, parseCsvText } from '../pdf-parser.js';

describe('parsePdfText', () => {
  it('parses single-word vendor items (IDX format)', () => {
    const text = `IDX\nIJAA\n48x60 UNIV FRM15.00 E\nA\nG1`;
    const result = parsePdfText(text);
    expect(result.items.length).toBe(1);
    expect(result.items[0].vendor).toBe('IDX');
    expect(result.items[0].itemNumber).toBe('IJAA');
    expect(result.items[0].description).toContain('48x60 UNIV FRM');
    expect(result.items[0].qtyOrdered).toBe('15');
    expect(result.items[0].fixtureBook).toBe('G1');
  });

  it('parses multi-word vendor items (AGILITY RETAIL)', () => {
    const text = `AGILITY RETAIL\nIMPORT\nCONR\n96"LWR RETAINER MILL34.00 E\nA`;
    const result = parsePdfText(text);
    expect(result.items.length).toBe(1);
    expect(result.items[0].vendor).toBe('AGILITY RETAIL');
    expect(result.items[0].materialClass).toBe('IMPORT');
    expect(result.items[0].itemNumber).toBe('CONR');
    expect(result.items[0].qtyOrdered).toBe('34');
  });

  it('parses split-line vendors (CAROLINA INNOVATIONS)', () => {
    const text = `CAROLINA\nINNOVATIONS\nCIDX\nMMX 48x21 PET BD WRE SHF40.00 E\nA`;
    const result = parsePdfText(text);
    expect(result.items.length).toBe(1);
    expect(result.items[0].vendor).toBe('CAROLINA INNOVATIONS');
    expect(result.items[0].itemNumber).toBe('CIDX');
  });

  it('detects section headers', () => {
    const text = `- TJ Smart Gondolas High Rise\nIDX\nIXHA\nTJ 48x66 SECT HI RISE71.00 E\nA\nF20`;
    const result = parsePdfText(text);
    expect(result.sections).toContain('TJ Smart Gondolas High Rise');
    expect(result.items[0].section).toBe('TJ Smart Gondolas High Rise');
  });

  it('detects multi-line section headers', () => {
    const text = `- TJ Beauty Multis-\nORDER 2 FOR EVERY\nNEW/REM STORE\nIDX\nILDC\nTJ BTY MULTI UNIT2.00 E\nA`;
    const result = parsePdfText(text);
    expect(result.sections[0]).toContain('TJ Beauty Multis');
    expect(result.items[0].section).toContain('TJ Beauty Multis');
  });

  it('parses delivery dates (MMDDYY)', () => {
    const text = `WESCO\nWECJ\nEIKO TRACK LAMP60.00 E\nA\n030926`;
    const result = parsePdfText(text);
    expect(result.items[0].delDate).toBe('2026-03-09');
  });

  it('skips page headers', () => {
    const text = `Spreadsheet Report Page 1\nT0092Rem 2/25/2026 10:19 AM\nTakeoff\nQuantity\nFixt.\nBook\nDeliv\nDate\nIDX\nIJAA\n48x60 UNIV FRM15.00 E\nA`;
    const result = parsePdfText(text);
    expect(result.items.length).toBe(1);
    expect(result.items[0].itemNumber).toBe('IJAA');
  });

  it('skips standalone E and A lines', () => {
    const text = `IDX\nIJAA\n48x60 UNIV FRM15.00 E\nA\nE\nA`;
    const result = parsePdfText(text);
    expect(result.items.length).toBe(1);
  });

  it('handles inline vendor+item format (pdfjs-dist style)', () => {
    const text = `WESCO WEBM MMX A LED 2X4 RECESSED\n2ESL4-48L-EZ1-LP835\n4.00 E\nA`;
    const result = parsePdfText(text);
    expect(result.items.length).toBe(1);
    expect(result.items[0].vendor).toBe('WESCO');
  });

  it('handles inline item+desc+qty on one line', () => {
    const text = `AGILITY RETAIL\nIMPORT\nCONR 96"LWR RETAINER MILL 34.00 E\nA`;
    const result = parsePdfText(text);
    expect(result.items.length).toBe(1);
    expect(result.items[0].itemNumber).toBe('CONR');
    expect(result.items[0].qtyOrdered).toBe('34');
  });

  it('handles quantities with commas (1,000.00)', () => {
    const text = `VIRA MFG.\nVQAH\nBTY 7 HK FACEOUT SB SLVR1,000.00 E\nA`;
    const result = parsePdfText(text);
    expect(result.items.length).toBe(1);
    expect(result.items[0].qtyOrdered).toBe('1000');
  });

  it('tracks skipped lines', () => {
    // Use a short all-caps string that doesn't match any vendor, item code, fixture book, or date pattern
    // and is too short to be treated as a section header (length <= 10 or no spaces)
    const text = `XYZGARBAGE\nIDX\nIJAA\n48x60 UNIV FRM15.00 E\nA`;
    const result = parsePdfText(text);
    expect(result.skipped.length).toBeGreaterThan(0);
    expect(result.items.length).toBe(1);
  });

  it('returns empty for empty input', () => {
    const result = parsePdfText('');
    expect(result.items).toEqual([]);
    expect(result.sections).toEqual([]);
  });

  it('handles multiple items in sequence', () => {
    const text = `IDX\nIJAA\n48x60 UNIV FRM15.00 E\nA\nG1\nIDX\nIJAI\n48x12 UNIV EXT FRM15.00 E\nA\nG1`;
    const result = parsePdfText(text);
    expect(result.items.length).toBe(2);
    expect(result.items[0].itemNumber).toBe('IJAA');
    expect(result.items[1].itemNumber).toBe('IJAI');
  });

  it('assigns fixture book to correct item', () => {
    const text = `IDX\nIJAA\n48x60 UNIV FRM15.00 E\nA\nG1\nIDX\nIJAI\n48x12 EXT FRM12.00 E\nA\nG2`;
    const result = parsePdfText(text);
    expect(result.items[0].fixtureBook).toBe('G1');
    expect(result.items[1].fixtureBook).toBe('G2');
  });
});

describe('parseCsvText', () => {
  it('parses tab-separated data', () => {
    const text = `Vendor\tDescription\tItem\tBook\tQty\tDate\tSection\nIDX\t48x60 UNIV FRM\tIJAA\tG1\t15\t030926\tGondolas`;
    const result = parseCsvText(text);
    expect(result.items.length).toBe(1);
    expect(result.items[0].vendor).toBe('IDX');
  });

  it('parses comma-separated data', () => {
    const text = `IDX,48x60 UNIV FRM,IJAA,G1,15,030926,Gondolas`;
    const result = parseCsvText(text);
    expect(result.items.length).toBe(1);
  });

  it('detects header row', () => {
    const text = `vendor,description,item,fixture_book,quantity,date,section\nIDX,Frame,IJAA,G1,15,,`;
    const result = parseCsvText(text);
    expect(result.items.length).toBe(1);
  });

  it('returns empty for empty input', () => {
    const result = parseCsvText('');
    expect(result.items).toEqual([]);
  });
});
