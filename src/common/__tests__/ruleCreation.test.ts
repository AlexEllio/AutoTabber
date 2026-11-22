import { describe, expect, it, vi } from 'vitest';
import { createRuleWithDuplicateHandling } from '../ruleCreation';
import { TabRule } from '../types';

describe('createRuleWithDuplicateHandling', () => {
  it('creates a new rule without prompting when its name is unique', async () => {
    const newRule: TabRule = {
      id: 'new',
      name: 'Documentation',
      color: 'green',
      patterns: ['docs.example.com*'],
      enabled: true,
      createdAt: 1,
      updatedAt: 1
    };
    const dependencies = {
      loadRules: async () => [],
      addRule: vi.fn(async () => newRule),
      updateRule: vi.fn(async () => undefined),
      prompts: {
        selectTarget: vi.fn(),
        chooseName: vi.fn(),
        confirmMerge: vi.fn(),
        requestUniqueName: vi.fn()
      }
    };

    await expect(
      createRuleWithDuplicateHandling(
        { name: 'Documentation', color: 'green', patterns: ['docs.example.com*'] },
        dependencies
      )
    ).resolves.toEqual({ type: 'created', name: 'Documentation' });

    expect(dependencies.addRule).toHaveBeenCalledWith({
      name: 'Documentation',
      color: 'green',
      patterns: ['docs.example.com*'],
      enabled: true
    });
    expect(dependencies.prompts.chooseName).not.toHaveBeenCalled();
    expect(dependencies.prompts.confirmMerge).not.toHaveBeenCalled();
  });

  it('merges missing patterns into the selected rule and preserves its settings', async () => {
    const existingRule: TabRule = {
      id: 'existing',
      name: ' GitHub ',
      color: 'purple',
      patterns: ['github.com*'],
      enabled: false,
      createdAt: 1,
      updatedAt: 2
    };
    const rules = [existingRule];
    const updateRule = vi.fn(async () => undefined);
    const dependencies = {
      loadRules: async () => rules,
      addRule: vi.fn(async () => existingRule),
      updateRule,
      prompts: {
        selectTarget: vi.fn(),
        chooseName: vi.fn(async () => 'new' as const),
        confirmMerge: vi.fn(async () => true),
        requestUniqueName: vi.fn()
      }
    };

    await expect(
      createRuleWithDuplicateHandling(
        {
          name: ' github ',
          color: 'orange',
          patterns: ['github.com*', 'github.com/docs*', 'github.com/docs*']
        },
        dependencies
      )
    ).resolves.toEqual({ type: 'merged', name: 'github' });

    expect(dependencies.prompts.chooseName).toHaveBeenCalledWith('github', 'GitHub');
    expect(dependencies.prompts.confirmMerge).toHaveBeenCalledOnce();
    expect(updateRule).toHaveBeenCalledWith('existing', {
      name: 'github',
      patterns: ['github.com*', 'github.com/docs*']
    });
    expect(dependencies.addRule).not.toHaveBeenCalled();
  });

  it('keeps the existing spelling when the user chooses it', async () => {
    const existingRule: TabRule = {
      id: 'existing',
      name: 'GitHub',
      color: 'purple',
      patterns: ['github.com*'],
      enabled: true,
      createdAt: 1,
      updatedAt: 1
    };
    const dependencies = {
      loadRules: async () => [existingRule],
      addRule: vi.fn(async () => existingRule),
      updateRule: vi.fn(async () => undefined),
      prompts: {
        selectTarget: vi.fn(),
        chooseName: vi.fn(async () => 'existing' as const),
        confirmMerge: vi.fn(async () => true),
        requestUniqueName: vi.fn()
      }
    };

    await expect(
      createRuleWithDuplicateHandling(
        { name: 'github', color: 'orange', patterns: ['github.com/docs*'] },
        dependencies
      )
    ).resolves.toEqual({ type: 'merged', name: 'GitHub' });

    expect(dependencies.updateRule).toHaveBeenCalledWith('existing', {
      name: 'GitHub',
      patterns: ['github.com*', 'github.com/docs*']
    });
  });

  it('creates a separate rule after the user supplies a unique replacement name', async () => {
    const existingRule: TabRule = {
      id: 'existing',
      name: 'Documentation',
      color: 'green',
      patterns: ['docs.example.com*'],
      enabled: true,
      createdAt: 1,
      updatedAt: 1
    };
    const newRule: TabRule = {
      ...existingRule,
      id: 'new',
      name: 'Documentation - Personal',
      patterns: ['personal.example.com*']
    };
    const dependencies = {
      loadRules: async () => [existingRule],
      addRule: vi.fn(async () => newRule),
      updateRule: vi.fn(async () => undefined),
      prompts: {
        selectTarget: vi.fn(),
        chooseName: vi.fn(),
        confirmMerge: vi.fn(async () => false),
        requestUniqueName: vi.fn(async () => 'Documentation - Personal')
      }
    };

    await expect(
      createRuleWithDuplicateHandling(
        { name: 'Documentation', color: 'orange', patterns: ['personal.example.com*'] },
        dependencies
      )
    ).resolves.toEqual({ type: 'created', name: 'Documentation - Personal' });

    expect(dependencies.prompts.chooseName).not.toHaveBeenCalled();
    expect(dependencies.addRule).toHaveBeenCalledWith({
      name: 'Documentation - Personal',
      color: 'orange',
      patterns: ['personal.example.com*'],
      enabled: true
    });
    expect(dependencies.updateRule).not.toHaveBeenCalled();
  });

  it('cancels without saving when the merge dialog is dismissed', async () => {
    const existingRule: TabRule = {
      id: 'existing',
      name: 'Documentation',
      color: 'green',
      patterns: ['docs.example.com*'],
      enabled: true,
      createdAt: 1,
      updatedAt: 1
    };
    const dependencies = {
      loadRules: async () => [existingRule],
      addRule: vi.fn(async () => existingRule),
      updateRule: vi.fn(async () => undefined),
      prompts: {
        selectTarget: vi.fn(),
        chooseName: vi.fn(),
        confirmMerge: vi.fn(async () => null),
        requestUniqueName: vi.fn()
      }
    };

    await expect(
      createRuleWithDuplicateHandling(
        { name: 'Documentation', color: 'orange', patterns: ['wiki.example.com*'] },
        dependencies
      )
    ).resolves.toEqual({ type: 'cancelled' });

    expect(dependencies.addRule).not.toHaveBeenCalled();
    expect(dependencies.updateRule).not.toHaveBeenCalled();
    expect(dependencies.prompts.requestUniqueName).not.toHaveBeenCalled();
  });

  it('lets the user choose a merge target when multiple saved rules match', async () => {
    const firstRule: TabRule = {
      id: 'first',
      name: 'GitHub',
      color: 'purple',
      patterns: ['github.com*'],
      enabled: true,
      createdAt: 1,
      updatedAt: 1
    };
    const secondRule: TabRule = {
      ...firstRule,
      id: 'second',
      name: 'github',
      color: 'blue',
      patterns: ['github.enterprise*']
    };
    const dependencies = {
      loadRules: async () => [firstRule, secondRule],
      addRule: vi.fn(async () => firstRule),
      updateRule: vi.fn(async () => undefined),
      prompts: {
        selectTarget: vi.fn(async (matches: TabRule[]) => matches[1].id),
        chooseName: vi.fn(),
        confirmMerge: vi.fn(async () => true),
        requestUniqueName: vi.fn()
      }
    };

    await expect(
      createRuleWithDuplicateHandling(
        { name: 'GITHUB', color: 'orange', patterns: ['git.example.com*'] },
        dependencies
      )
    ).resolves.toEqual({ type: 'merged', name: 'GITHUB' });

    expect(dependencies.prompts.selectTarget).toHaveBeenCalledWith([firstRule, secondRule]);
    expect(dependencies.updateRule).toHaveBeenCalledWith('second', {
      name: 'GITHUB',
      patterns: ['github.enterprise*', 'git.example.com*']
    });
  });

  it('rechecks a replacement name and handles its duplicate instead of creating another rule', async () => {
    const firstRule: TabRule = {
      id: 'docs',
      name: 'Docs',
      color: 'green',
      patterns: ['docs.example.com*'],
      enabled: true,
      createdAt: 1,
      updatedAt: 1
    };
    const secondRule: TabRule = {
      ...firstRule,
      id: 'jira',
      name: 'Jira',
      color: 'blue',
      patterns: ['jira.example.com*']
    };
    const confirmMerge = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const dependencies = {
      loadRules: async () => [firstRule, secondRule],
      addRule: vi.fn(async () => firstRule),
      updateRule: vi.fn(async () => undefined),
      prompts: {
        selectTarget: vi.fn(),
        chooseName: vi.fn(),
        confirmMerge,
        requestUniqueName: vi.fn(async () => 'Jira')
      }
    };

    await expect(
      createRuleWithDuplicateHandling(
        { name: 'Docs', color: 'orange', patterns: ['wiki.example.com*'] },
        dependencies
      )
    ).resolves.toEqual({ type: 'merged', name: 'Jira' });

    expect(dependencies.prompts.requestUniqueName).toHaveBeenCalledWith('Docs');
    expect(confirmMerge).toHaveBeenCalledTimes(2);
    expect(dependencies.updateRule).toHaveBeenCalledWith('jira', {
      name: 'Jira',
      patterns: ['jira.example.com*', 'wiki.example.com*']
    });
    expect(dependencies.addRule).not.toHaveBeenCalled();
  });
});
