import { MatchResult, TabRule } from './types';

/**
 * Normalizes a URL by stripping hashes and query parameters (unless specifically needed),
 * and extracting the host and pathname.
 */
export function parseUrl(rawUrl: string): { host: string; pathname: string; full: string } | null {
  try {
    // If not a full URL with scheme, try prepending https://
    let urlToParse = rawUrl.trim();
    if (!/^[a-zA-Z]+:\/\//.test(urlToParse)) {
      urlToParse = 'https://' + urlToParse;
    }
    const url = new URL(urlToParse);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    return {
      host,
      pathname,
      full: `${host}${pathname === '/' ? '' : pathname}`
    };
  } catch {
    return null;
  }
}

/**
 * Checks if a pattern matches a URL and returns a specificity score.
 * Returns -1 if no match. Higher score means more specific.
 */
export function matchPatternWithScore(pattern: string, urlStr: string): number {
  const parsed = parseUrl(urlStr);
  if (!parsed) return -1;

  let cleanPattern = pattern.trim().toLowerCase();
  // Strip scheme if present (http://, https://, *://)
  cleanPattern = cleanPattern.replace(/^(\*|https?):\/\//, '');

  if (!cleanPattern) return -1;

  // Split pattern into host part and path part
  let patternHost = cleanPattern;
  let patternPath = '';

  const slashIndex = cleanPattern.indexOf('/');
  if (slashIndex !== -1) {
    patternHost = cleanPattern.substring(0, slashIndex);
    patternPath = cleanPattern.substring(slashIndex);
  }

  // 1. Host matching
  let hostMatched = false;
  let hostSpecificity = 0;

  if (patternHost.includes('*')) {
    // Wildcard host pattern: e.g. *.atlassian.net or dev-*.domain.com
    const regexPattern = '^' + escapeRegex(patternHost).replace(/\\\*/g, '[a-z0-9.-]*') + '$';
    const regex = new RegExp(regexPattern);
    if (regex.test(parsed.host)) {
      hostMatched = true;
      hostSpecificity = patternHost.replace(/\*/g, '').length;
    }
  } else {
    // Exact or suffix domain match:
    // e.g. "atlassian.net" matches "atlassian.net" AND "mycompany.atlassian.net"
    if (parsed.host === patternHost) {
      hostMatched = true;
      hostSpecificity = patternHost.length + 10; // Exact host match bonus
    } else if (parsed.host.endsWith('.' + patternHost)) {
      hostMatched = true;
      hostSpecificity = patternHost.length;
    }
  }

  if (!hostMatched) {
    return -1;
  }

  // 2. Path matching
  // Clean up patternPath: remove trailing slash unless it's just '/'
  if (patternPath.endsWith('/') && patternPath.length > 1) {
    patternPath = patternPath.slice(0, -1);
  }

  let pathMatched = false;
  let pathSpecificity = 0;

  if (!patternPath || patternPath === '/' || patternPath === '/*') {
    // Matches any path on this host
    pathMatched = true;
    pathSpecificity = 0;
  } else {
    // If patternPath ends with wildcard, e.g. /wiki*
    if (patternPath.endsWith('*')) {
      const prefix = patternPath.slice(0, -1);
      if (parsed.pathname.startsWith(prefix)) {
        pathMatched = true;
        pathSpecificity = prefix.length * 10;
      }
    } else {
      // Exact path segment or path prefix:
      // /wiki matches /wiki, /wiki/, /wiki/spaces/123
      // but NOT /wikipedia
      if (
        parsed.pathname === patternPath ||
        parsed.pathname.startsWith(patternPath + '/')
      ) {
        pathMatched = true;
        pathSpecificity = patternPath.length * 10 + 5; // Exact segment bonus
      }
    }
  }

  if (!pathMatched) {
    return -1;
  }

  return hostSpecificity + pathSpecificity;
}

/**
 * Finds the best matching enabled rule for a given URL.
 * Respects specificity first, then rule list order as tiebreaker.
 */
export function findBestRuleMatch(rules: TabRule[], url: string): MatchResult | null {
  if (!url || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('chrome-extension://')) {
    return null;
  }

  let bestMatch: MatchResult | null = null;

  for (const rule of rules) {
    if (!rule.enabled) continue;

    for (const pattern of rule.patterns) {
      const score = matchPatternWithScore(pattern, url);
      if (score > -1) {
        if (!bestMatch || score > bestMatch.specificityScore) {
          bestMatch = {
            rule,
            matchedPattern: pattern,
            specificityScore: score
          };
        }
      }
    }
  }

  return bestMatch;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
