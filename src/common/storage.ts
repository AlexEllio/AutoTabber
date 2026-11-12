import { AutoTabberSettings, ChromeGroupColor, StorageData, TabRule } from './types';

export const CHROME_GROUP_COLORS: ChromeGroupColor[] = [
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
  'grey'
];

export const DEFAULT_RULES: TabRule[] = [
  {
    id: 'starter-confluence',
    name: 'Confluence',
    color: 'green',
    patterns: ['atlassian.net/wiki*'],
    enabled: true,
    createdAt: Date.now() - 3000,
    updatedAt: Date.now() - 3000
  },
  {
    id: 'starter-jira',
    name: 'Jira',
    color: 'blue',
    patterns: ['atlassian.net/jira*'],
    enabled: true,
    createdAt: Date.now() - 2000,
    updatedAt: Date.now() - 2000
  },
  {
    id: 'starter-github',
    name: 'GitHub',
    color: 'purple',
    patterns: ['github.com*'],
    enabled: true,
    createdAt: Date.now() - 1000,
    updatedAt: Date.now() - 1000
  }
];

export const DEFAULT_SETTINGS: AutoTabberSettings = {
  autoCollapseInactive: false,
  retroactiveGroupingOnStartup: true
};

function getStorageArea(): chrome.storage.StorageArea {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return chrome.storage.sync || chrome.storage.local;
  }
  // Mock fallback for non-extension environments (e.g. testing)
  const mockStorage: Record<string, any> = {};
  return {
    get: (keys: any, callback?: any) => {
      const res: Record<string, any> = {};
      if (Array.isArray(keys)) {
        keys.forEach((k) => (res[k] = mockStorage[k]));
      } else if (typeof keys === 'string') {
        res[keys] = mockStorage[keys];
      } else if (typeof keys === 'object' && keys !== null) {
        Object.keys(keys).forEach((k) => (res[k] = mockStorage[k] ?? keys[k]));
      }
      if (callback) callback(res);
      return Promise.resolve(res);
    },
    set: (items: any, callback?: any) => {
      Object.assign(mockStorage, items);
      if (callback) callback();
      return Promise.resolve();
    }
  } as unknown as chrome.storage.StorageArea;
}

export async function getStorageData(): Promise<StorageData> {
  const storage = getStorageArea();
  try {
    const data = await storage.get(['rules', 'settings']);
    let rules = data.rules;
    let settings = data.settings;

    if (!rules || !Array.isArray(rules) || rules.length === 0) {
      rules = DEFAULT_RULES;
      await storage.set({ rules });
    }

    if (!settings) {
      settings = DEFAULT_SETTINGS;
      await storage.set({ settings });
    }

    return { rules, settings };
  } catch (err) {
    console.error('AutoTabber: Error reading storage:', err);
    return { rules: DEFAULT_RULES, settings: DEFAULT_SETTINGS };
  }
}

export async function saveRules(rules: TabRule[]): Promise<void> {
  const storage = getStorageArea();
  await storage.set({ rules });
}

export async function saveSettings(settings: AutoTabberSettings): Promise<void> {
  const storage = getStorageArea();
  await storage.set({ settings });
}

export async function addRule(
  rule: Omit<TabRule, 'id' | 'createdAt' | 'updatedAt'>
): Promise<TabRule> {
  const { rules } = await getStorageData();
  const newRule: TabRule = {
    ...rule,
    id: 'rule-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  rules.unshift(newRule);
  await saveRules(rules);
  return newRule;
}

export async function updateRule(
  id: string,
  updates: Partial<Omit<TabRule, 'id' | 'createdAt'>>
): Promise<void> {
  const { rules } = await getStorageData();
  const index = rules.findIndex((r) => r.id === id);
  if (index !== -1) {
    rules[index] = {
      ...rules[index],
      ...updates,
      updatedAt: Date.now()
    };
    await saveRules(rules);
  }
}

export async function deleteRule(id: string): Promise<void> {
  const { rules } = await getStorageData();
  const filtered = rules.filter((r) => r.id !== id);
  await saveRules(filtered);
}

export async function exportRulesJson(): Promise<string> {
  const data = await getStorageData();
  return JSON.stringify(data, null, 2);
}

export async function importRulesJson(
  jsonStr: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || !Array.isArray(parsed.rules)) {
      return { success: false, error: 'Invalid file format: missing "rules" array.' };
    }

    const validatedRules: TabRule[] = parsed.rules.map((r: any, idx: number) => ({
      id: typeof r.id === 'string' ? r.id : 'rule-' + Date.now() + '-' + idx,
      name: typeof r.name === 'string' ? r.name : 'Untitled Group',
      color: CHROME_GROUP_COLORS.includes(r.color) ? r.color : 'blue',
      patterns: Array.isArray(r.patterns) ? r.patterns.filter((p: any) => typeof p === 'string' && p.trim()) : [],
      enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
      updatedAt: Date.now()
    }));

    await saveRules(validatedRules);

    if (parsed.settings && typeof parsed.settings === 'object') {
      const current = (await getStorageData()).settings;
      await saveSettings({
        autoCollapseInactive: Boolean(parsed.settings.autoCollapseInactive ?? current.autoCollapseInactive),
        retroactiveGroupingOnStartup: Boolean(parsed.settings.retroactiveGroupingOnStartup ?? current.retroactiveGroupingOnStartup)
      });
    }

    return { success: true, count: validatedRules.length };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to parse JSON' };
  }
}
