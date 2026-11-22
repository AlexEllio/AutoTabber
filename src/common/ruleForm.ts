import { ChromeGroupColor } from './types';

export interface RuleFormData {
  name: string;
  color: ChromeGroupColor;
  patterns: string[];
}

export function getRuleFormData(
  name: string,
  color: ChromeGroupColor,
  patternValues: string[]
): RuleFormData | null {
  const trimmedName = name.trim();
  const patterns = patternValues
    .flatMap((value) => value.split(/[\n,]+/))
    .map((pattern) => pattern.trim())
    .filter(Boolean);

  if (!trimmedName || patterns.length === 0) return null;

  return { name: trimmedName, color, patterns };
}

export async function saveRuleForm(
  name: string,
  color: ChromeGroupColor,
  patternValues: string[],
  save: (data: RuleFormData) => Promise<unknown>
): Promise<RuleFormData | null> {
  const formData = getRuleFormData(name, color, patternValues);
  if (!formData) return null;

  await save(formData);
  return formData;
}
