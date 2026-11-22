import { RuleFormData } from './ruleForm';
import { normalizeTabGroupName } from './tabGroupName';
import { ChromeGroupColor, TabRule } from './types';

type NewTabRule = Omit<TabRule, 'id' | 'createdAt' | 'updatedAt'>;
type NameChoice = 'new' | 'existing' | 'cancel';

export interface RuleCreationTarget {
  name: string;
  rule: TabRule | null;
  tabGroups: chrome.tabGroups.TabGroup[];
}

export interface RuleCreationPrompts {
  selectTarget: (matches: TabRule[]) => Promise<string | null>;
  chooseName: (newName: string, existingName: string) => Promise<NameChoice>;
  confirmMerge: (target: RuleCreationTarget, incoming: RuleFormData) => Promise<boolean | null>;
  requestUniqueName: (currentName: string) => Promise<string | null>;
}

export interface RuleCreationDependencies {
  loadRules: () => Promise<TabRule[]>;
  loadTabGroups: () => Promise<chrome.tabGroups.TabGroup[]>;
  addRule: (rule: NewTabRule) => Promise<TabRule>;
  updateRule: (
    id: string,
    updates: Partial<Omit<TabRule, 'id' | 'createdAt'>>
  ) => Promise<void>;
  mergeTabGroups: (name: string, color: ChromeGroupColor) => Promise<void>;
  prompts: RuleCreationPrompts;
}

export type RuleCreationResult =
  | { type: 'created'; name: string; nativeGroupsMerged?: boolean }
  | { type: 'merged'; name: string; nativeGroupsMerged?: boolean }
  | { type: 'cancelled' };

function getMatchingRules(rules: TabRule[], name: string): TabRule[] {
  const normalizedName = normalizeTabGroupName(name);
  return rules.filter((rule) => normalizeTabGroupName(rule.name) === normalizedName);
}

function getMatchingTabGroups(
  tabGroups: chrome.tabGroups.TabGroup[],
  name: string
): chrome.tabGroups.TabGroup[] {
  const normalizedName = normalizeTabGroupName(name);
  return tabGroups.filter((group) => normalizeTabGroupName(group.title) === normalizedName);
}

export async function createRuleWithDuplicateHandling(
  formData: RuleFormData,
  dependencies: RuleCreationDependencies
): Promise<RuleCreationResult> {
  let newRuleData = formData;

  while (true) {
    const [rules, tabGroups] = await Promise.all([
      dependencies.loadRules(),
      dependencies.loadTabGroups()
    ]);
    const matches = getMatchingRules(rules, newRuleData.name);
    const matchingTabGroups = getMatchingTabGroups(tabGroups, newRuleData.name);

    if (matches.length === 0 && matchingTabGroups.length === 0) {
      const createdRule = await dependencies.addRule({ ...newRuleData, enabled: true });
      return { type: 'created', name: createdRule.name };
    }

    let target: TabRule | null = matches.length > 0 ? matches[0] : null;
    if (matches.length > 1) {
      const targetId = await dependencies.prompts.selectTarget(matches);
      if (!targetId) return { type: 'cancelled' };

      const selectedTarget = matches.find((rule) => rule.id === targetId);
      if (!selectedTarget) {
        throw new Error('The selected rule is not one of the matching rules.');
      }
      target = selectedTarget;
    }

    const newName = newRuleData.name.trim();
    const existingName = (target?.name ?? matchingTabGroups[0]?.title ?? '').trim();
    let nameChoice: NameChoice = 'new';
    if (newName !== existingName) {
      nameChoice = await dependencies.prompts.chooseName(newName, existingName);
      if (nameChoice === 'cancel') return { type: 'cancelled' };
    }

    const mergedName = nameChoice === 'existing' ? existingName : newName;
    const incoming = { ...newRuleData, name: mergedName };
    const creationTarget: RuleCreationTarget = {
      name: existingName,
      rule: target,
      tabGroups: matchingTabGroups
    };
    const shouldMerge = await dependencies.prompts.confirmMerge(creationTarget, incoming);
    if (shouldMerge === null) return { type: 'cancelled' };
    if (shouldMerge) {
      let result: RuleCreationResult;
      let color = newRuleData.color;
      if (target) {
        const existingPatterns = new Set(target.patterns.map((pattern) => pattern.trim()));
        const patterns = [...target.patterns];
        for (const pattern of incoming.patterns) {
          const normalizedPattern = pattern.trim();
          if (existingPatterns.has(normalizedPattern)) continue;
          patterns.push(normalizedPattern);
          existingPatterns.add(normalizedPattern);
        }
        await dependencies.updateRule(target.id, { name: mergedName, patterns });
        color = target.color;
        result = { type: 'merged', name: mergedName };
      } else {
        const createdRule = await dependencies.addRule({
          ...incoming,
          enabled: true
        });
        color = createdRule.color;
        result = { type: 'created', name: createdRule.name };
      }

      if (matchingTabGroups.length > 0) {
        try {
          await dependencies.mergeTabGroups(mergedName, color);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`The rule was saved, but matching Chrome tab groups could not be merged: ${message}`);
        }
        return { ...result, nativeGroupsMerged: true };
      }
      return result;
    }

    const uniqueName = await dependencies.prompts.requestUniqueName(newRuleData.name);
    if (uniqueName === null) return { type: 'cancelled' };

    const trimmedUniqueName = uniqueName.trim();
    if (!trimmedUniqueName) {
      throw new Error('A unique rule name must not be empty.');
    }
    newRuleData = { ...newRuleData, name: trimmedUniqueName };
  }
}
