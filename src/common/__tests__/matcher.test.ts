import { describe, it, expect } from 'vitest';
import { matchPatternWithScore, findBestRuleMatch, parseUrl } from '../matcher';
import { TabRule } from '../types';

describe('parseUrl', () => {
  it('correctly parses full https URLs', () => {
    const parsed = parseUrl('https://mycompany.atlassian.net/wiki/spaces/123');
    expect(parsed).toEqual({
      host: 'mycompany.atlassian.net',
      pathname: '/wiki/spaces/123',
      full: 'mycompany.atlassian.net/wiki/spaces/123'
    });
  });

  it('normalizes trailing slashes', () => {
    const parsed = parseUrl('https://github.com/');
    expect(parsed?.pathname).toBe('/');
  });
});

describe('matchPatternWithScore', () => {
  it('matches domain suffix and path prefix', () => {
    const score = matchPatternWithScore('atlassian.net/wiki', 'https://mycompany.atlassian.net/wiki/spaces/HOME');
    expect(score).toBeGreaterThan(0);
  });

  it('does not match partial path segment', () => {
    const score = matchPatternWithScore('atlassian.net/wiki', 'https://mycompany.atlassian.net/wikipedia');
    expect(score).toBe(-1);
  });

  it('matches wildcards in host', () => {
    const score = matchPatternWithScore('*.github.com', 'https://gist.github.com/user/123');
    expect(score).toBeGreaterThan(0);
  });

  it('assigns higher specificity to path-specific rules than domain-only rules', () => {
    const domainOnlyScore = matchPatternWithScore('atlassian.net', 'https://mycompany.atlassian.net/wiki/home');
    const pathSpecificScore = matchPatternWithScore('atlassian.net/wiki', 'https://mycompany.atlassian.net/wiki/home');
    expect(pathSpecificScore).toBeGreaterThan(domainOnlyScore);
  });

  it('assigns higher specificity to deeper path matches', () => {
    const shallow = matchPatternWithScore('atlassian.net/wiki', 'https://mycompany.atlassian.net/wiki/spaces/team');
    const deep = matchPatternWithScore('atlassian.net/wiki/spaces', 'https://mycompany.atlassian.net/wiki/spaces/team');
    expect(deep).toBeGreaterThan(shallow);
  });
});

describe('findBestRuleMatch', () => {
  const rules: TabRule[] = [
    {
      id: 'rule-atlassian-general',
      name: 'Atlassian General',
      color: 'blue',
      patterns: ['atlassian.net'],
      enabled: true,
      createdAt: 1,
      updatedAt: 1
    },
    {
      id: 'rule-confluence',
      name: 'Confluence',
      color: 'green',
      patterns: ['atlassian.net/wiki'],
      enabled: true,
      createdAt: 2,
      updatedAt: 2
    },
    {
      id: 'rule-jira',
      name: 'Jira',
      color: 'blue',
      patterns: ['atlassian.net/jira'],
      enabled: true,
      createdAt: 3,
      updatedAt: 3
    }
  ];

  it('matches Confluence over General Atlassian due to path specificity', () => {
    const match = findBestRuleMatch(rules, 'https://myorg.atlassian.net/wiki/spaces/ENG/pages/100');
    expect(match).not.toBeNull();
    expect(match?.rule.id).toBe('rule-confluence');
    expect(match?.rule.name).toBe('Confluence');
  });

  it('matches Jira over General Atlassian', () => {
    const match = findBestRuleMatch(rules, 'https://myorg.atlassian.net/jira/your-work');
    expect(match).not.toBeNull();
    expect(match?.rule.id).toBe('rule-jira');
  });

  it('falls back to General Atlassian when neither Confluence nor Jira matches', () => {
    const match = findBestRuleMatch(rules, 'https://myorg.atlassian.net/admin/billing');
    expect(match).not.toBeNull();
    expect(match?.rule.id).toBe('rule-atlassian-general');
  });

  it('ignores chrome:// internal URLs', () => {
    const match = findBestRuleMatch(rules, 'chrome://extensions');
    expect(match).toBeNull();
  });

  it('skips disabled rules', () => {
    const disabledConfluence: TabRule[] = rules.map((r) =>
      r.id === 'rule-confluence' ? { ...r, enabled: false } : r
    );
    const match = findBestRuleMatch(disabledConfluence, 'https://myorg.atlassian.net/wiki/home');
    expect(match?.rule.id).toBe('rule-atlassian-general');
  });
});
