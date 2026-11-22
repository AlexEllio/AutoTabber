import { RuleFormData } from './ruleForm';
import { TabRule } from './types';

type NewTabRule = Omit<TabRule, 'id' | 'createdAt' | 'updatedAt'>;
type NameChoice = 'new' | 'existing' | 'cancel';

export interface RuleCreationPrompts {
  selectTarget: (matches: TabRule[]) => Promise<string | null>;
  chooseName: (newName: string, existingName: string) => Promise<NameChoice>;
  confirmMerge: (target: TabRule, incoming: RuleFormData) => Promise<boolean | null>;
  requestUniqueName: (currentName: string) => Promise<string | null>;
}

export interface RuleCreationDependencies {
  loadRules: () => Promise<TabRule[]>;
  addRule: (rule: NewTabRule) => Promise<TabRule>;
  updateRule: (
    id: string,
    updates: Partial<Omit<TabRule, 'id' | 'createdAt'>>
  ) => Promise<void>;
  prompts: RuleCreationPrompts;
}

export type RuleCreationResult =
  | { type: 'created'; name: string }
  | { type: 'merged'; name: string }
  | { type: 'cancelled' };

function normalizeRuleName(name: string): string {
  return name.trim().toLowerCase();
}

function getMatchingRules(rules: TabRule[], name: string): TabRule[] {
  const normalizedName = normalizeRuleName(name);
  return rules.filter((rule) => normalizeRuleName(rule.name) === normalizedName);
}

export async function createRuleWithDuplicateHandling(
  formData: RuleFormData,
  dependencies: RuleCreationDependencies
): Promise<RuleCreationResult> {
  let newRuleData = formData;

  while (true) {
    const rules = await dependencies.loadRules();
    const matches = getMatchingRules(rules, newRuleData.name);

    if (matches.length === 0) {
      const createdRule = await dependencies.addRule({ ...newRuleData, enabled: true });
      return { type: 'created', name: createdRule.name };
    }

    let target = matches[0];
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
    const existingName = target.name.trim();
    let nameChoice: NameChoice = 'new';
    if (newName !== existingName) {
      nameChoice = await dependencies.prompts.chooseName(newName, existingName);
      if (nameChoice === 'cancel') return { type: 'cancelled' };
    }

    const mergedName = nameChoice === 'existing' ? existingName : newName;
    const incoming = { ...newRuleData, name: mergedName };
    const shouldMerge = await dependencies.prompts.confirmMerge(target, incoming);
    if (shouldMerge === null) return { type: 'cancelled' };
    if (shouldMerge) {
      const existingPatterns = new Set(target.patterns.map((pattern) => pattern.trim()));
      const patterns = [...target.patterns];
      for (const pattern of incoming.patterns) {
        const normalizedPattern = pattern.trim();
        if (existingPatterns.has(normalizedPattern)) continue;
        patterns.push(normalizedPattern);
        existingPatterns.add(normalizedPattern);
      }
      await dependencies.updateRule(target.id, { name: mergedName, patterns });
      return { type: 'merged', name: mergedName };
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
