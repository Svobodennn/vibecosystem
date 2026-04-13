import { describe, it, expect } from 'vitest';
import { parseFrontmatter, getAgentTier } from '../model-router.js';

describe('model-router', () => {
  describe('parseFrontmatter', () => {
    it('parses name field', () => {
      const content = '---\nname: code-reviewer\ntier: 2\n---\n# Agent';
      const fm = parseFrontmatter(content);
      expect(fm.name).toBe('code-reviewer');
    });

    it('parses tier field as integer', () => {
      const content = '---\nname: architect\ntier: 3\n---\n';
      const fm = parseFrontmatter(content);
      expect(fm.tier).toBe(3);
    });

    it('parses model field', () => {
      const content = '---\nname: test\nmodel: opus\ntier: 3\n---\n';
      const fm = parseFrontmatter(content);
      expect(fm.model).toBe('opus');
    });

    it('returns empty object for no frontmatter', () => {
      const content = '# Just a heading\nSome content';
      const fm = parseFrontmatter(content);
      expect(fm).toEqual({});
    });

    it('returns empty object for empty string', () => {
      const fm = parseFrontmatter('');
      expect(fm).toEqual({});
    });

    it('handles values with colons', () => {
      const content = '---\nname: my-agent:v2\ntier: 2\n---\n';
      const fm = parseFrontmatter(content);
      expect(fm.name).toBe('my-agent:v2');
    });

    it('ignores lines without key-value separator', () => {
      const content = '---\nname: test\nrandom text\ntier: 2\n---\n';
      const fm = parseFrontmatter(content);
      expect(fm.name).toBe('test');
      expect(fm.tier).toBe(2);
    });
  });

  describe('getAgentTier', () => {
    it('returns tier 3 for architect (default tier)', () => {
      expect(getAgentTier('architect')).toBe(3);
    });

    it('returns tier 3 for planner (default tier)', () => {
      expect(getAgentTier('planner')).toBe(3);
    });

    it('returns tier 3 for sleuth (default tier)', () => {
      expect(getAgentTier('sleuth')).toBe(3);
    });

    it('returns tier 2 for unknown agent (default)', () => {
      expect(getAgentTier('nonexistent-agent-xyz')).toBe(2);
    });

    it('returns tier 2 for invalid agent name (path traversal)', () => {
      expect(getAgentTier('../../../etc/passwd')).toBe(2);
    });

    it('returns tier 2 for agent name with semicolon', () => {
      expect(getAgentTier('agent;rm -rf /')).toBe(2);
    });

    it('returns tier 2 for agent name with spaces', () => {
      expect(getAgentTier('agent name')).toBe(2);
    });

    it('accepts valid agent names with hyphens', () => {
      // code-reviewer is not in DEFAULT_TIERS so returns 2
      expect(getAgentTier('code-reviewer')).toBe(2);
    });

    it('accepts valid agent names with underscores', () => {
      expect(getAgentTier('a11y_expert')).toBe(2);
    });
  });
});
