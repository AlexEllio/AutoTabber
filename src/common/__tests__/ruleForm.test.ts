import { describe, expect, it, vi } from 'vitest';
import { getRuleFormData, saveRuleForm } from '../ruleForm';

describe('getRuleFormData', () => {
  it('collects multiple trimmed patterns from rows and pasted delimiters', () => {
    expect(
      getRuleFormData('  Documentation  ', 'green', [
        'docs.example.com',
        'help.example.com, *.help.example.com\nsupport.example.com',
        '  '
      ])
    ).toEqual({
      name: 'Documentation',
      color: 'green',
      patterns: [
        'docs.example.com',
        'help.example.com',
        '*.help.example.com',
        'support.example.com'
      ]
    });
  });

  it('rejects a group without a name or any patterns', () => {
    expect(getRuleFormData('Documentation', 'green', ['', '  '])).toBeNull();
    expect(getRuleFormData('  ', 'green', ['docs.example.com'])).toBeNull();
  });

  it('sends all entered patterns to the persistence callback on submit', async () => {
    const save = vi.fn(async () => undefined);

    await saveRuleForm(
      'Documentation',
      'green',
      ['docs.example.com', 'help.example.com, support.example.com'],
      save
    );

    expect(save).toHaveBeenCalledWith({
      name: 'Documentation',
      color: 'green',
      patterns: ['docs.example.com', 'help.example.com', 'support.example.com']
    });
  });

  it('does not persist a submitted group without patterns', async () => {
    const save = vi.fn(async () => undefined);

    await expect(saveRuleForm('Documentation', 'green', ['  '], save)).resolves.toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});
