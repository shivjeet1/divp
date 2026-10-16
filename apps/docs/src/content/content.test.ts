import { describe, expect, it } from 'vitest';
import { ENDPOINTS, ERROR_CODES } from './api';
import { SECTIONS } from './nav';
import { PIPELINE_STEPS } from './pipeline';
import { ATTACKS, SECURITY_PROPERTIES, THREATS } from './security';
import { TEST_MATRIX } from './tests';

/**
 * Content-integrity checks for the documentation portal. These guard the
 * invariants the UI relies on (unique ids, sequential steps, well-formed
 * endpoints) so a content edit cannot silently break navigation or rendering.
 */
describe('docs content integrity', () => {
  it('exposes a unique id for every navigation section', () => {
    const ids = SECTIONS.map((s) => s.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('numbers pipeline steps sequentially from 1', () => {
    PIPELINE_STEPS.forEach((step, index) => expect(step.n).toBe(index + 1));
    const ids = PIPELINE_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('defines well-formed API endpoints', () => {
    expect(ENDPOINTS.length).toBeGreaterThan(0);
    for (const endpoint of ENDPOINTS) {
      expect(endpoint.path.startsWith('/')).toBe(true);
      expect(endpoint.summary.length).toBeGreaterThan(0);
      expect(['GET', 'POST', 'PATCH', 'DELETE']).toContain(endpoint.method);
    }
  });

  it('documents the ten required attacks in order', () => {
    expect(ATTACKS).toHaveLength(10);
    expect(ATTACKS.map((a) => a.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('has a non-empty mitigation for every threat', () => {
    expect(THREATS.length).toBeGreaterThan(0);
    for (const threat of THREATS) {
      expect(threat.mitigation.length).toBeGreaterThan(0);
      expect(threat.threat.length).toBeGreaterThan(0);
    }
  });

  it('documents security properties and test suites', () => {
    expect(SECURITY_PROPERTIES.length).toBeGreaterThan(0);
    expect(TEST_MATRIX.length).toBeGreaterThan(0);
  });

  it('assigns a client-error-or-worse status to every error code', () => {
    for (const code of ERROR_CODES) {
      expect(code.status).toBeGreaterThanOrEqual(400);
    }
  });
});
