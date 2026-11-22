import { RuleCreationPrompts } from './ruleCreation';
import type { RuleCreationTarget } from './ruleCreation';
import { TabRule } from './types';

interface DialogChoice {
  label: string;
  value: string;
  primary?: boolean;
}

function createDialog(title: string, description: string): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = 'rule-creation-dialog';
  dialog.setAttribute('aria-labelledby', 'rule-creation-dialog-title');
  dialog.setAttribute('aria-describedby', 'rule-creation-dialog-description');

  const heading = document.createElement('h2');
  heading.id = 'rule-creation-dialog-title';
  heading.textContent = title;

  const message = document.createElement('p');
  message.id = 'rule-creation-dialog-description';
  message.textContent = description;

  dialog.append(heading, message);
  return dialog;
}

function showChoiceDialog(
  title: string,
  description: string,
  choices: DialogChoice[]
): Promise<string | null> {
  const dialog = createDialog(title, description);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(value);
    };

    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(null);
    });
    dialog.addEventListener('close', () => finish(null));

    const actions = document.createElement('div');
    actions.className = 'rule-creation-dialog-actions';
    for (const choice of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn ${choice.primary ? 'btn-primary' : 'btn-secondary'}`;
      button.textContent = choice.label;
      button.addEventListener('click', () => finish(choice.value));
      actions.appendChild(button);
    }

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn btn-secondary';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => finish(null));
    actions.appendChild(cancelButton);
    dialog.appendChild(actions);

    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

function showUniqueNameDialog(currentName: string): Promise<string | null> {
  const dialog = createDialog(
    'Create a separate rule',
    `Choose a unique name for this rule. If the name already exists, you can resolve that match next.`
  );
  const form = document.createElement('form');
  const label = document.createElement('label');
  label.htmlFor = 'rule-creation-unique-name';
  label.textContent = 'New rule name';

  const input = document.createElement('input');
  input.id = 'rule-creation-unique-name';
  input.className = 'input-text';
  input.type = 'text';
  input.required = true;
  input.value = currentName;
  input.autocomplete = 'off';
  input.addEventListener('input', () => input.setCustomValidity(''));

  const actions = document.createElement('div');
  actions.className = 'rule-creation-dialog-actions';
  const createButton = document.createElement('button');
  createButton.type = 'submit';
  createButton.className = 'btn btn-primary';
  createButton.textContent = 'Create separate rule';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn btn-secondary';
  cancelButton.textContent = 'Cancel';
  actions.append(createButton, cancelButton);
  form.append(label, input, actions);
  dialog.appendChild(form);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(value);
    };

    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(null);
    });
    dialog.addEventListener('close', () => finish(null));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) {
        input.setCustomValidity('Enter a unique name.');
        input.reportValidity();
        return;
      }
      finish(name);
    });
    cancelButton.addEventListener('click', () => finish(null));

    document.body.appendChild(dialog);
    dialog.showModal();
    input.focus();
    input.select();
  });
}

export function createRuleCreationPrompts(): RuleCreationPrompts {
  return {
    selectTarget: async (matches: TabRule[]) => {
      const choice = await showChoiceDialog(
        'Choose an existing rule',
        'More than one saved rule has this name. Choose where to add the pattern.',
        matches.map((rule, index) => ({
          label: `Rule ${index + 1}: ${rule.name} (${rule.color}, ${rule.enabled ? 'enabled' : 'disabled'}) - ${rule.patterns.join(', ')}`,
          value: rule.id
        }))
      );
      return choice;
    },
    chooseName: async (newName: string, existingName: string) => {
      const choice = await showChoiceDialog(
        'Choose the rule name',
        'Which spelling should be kept?',
        [
          { label: `Use "${newName}"`, value: 'new', primary: true },
          { label: `Keep "${existingName}"`, value: 'existing' }
        ]
      );
      if (choice === 'new' || choice === 'existing') return choice;
      return 'cancel';
    },
    confirmMerge: async (target: RuleCreationTarget, incoming) => {
      const descriptionParts = target.rule
        ? [
            `Add the new URL patterns to the saved rule "${target.rule.name}".`,
            'Patterns already present will not be duplicated, and existing rule settings will be preserved.'
          ]
        : [`Create the saved rule "${incoming.name}" for future matching tabs.`];
      if (target.tabGroups.length > 0) {
        descriptionParts.push(
          `Merge all tabs from ${target.tabGroups.length} matching Chrome tab group(s) into one group per window.`
        );
      }

      const choice = await showChoiceDialog(
        target.tabGroups.length > 0
          ? `Merge with "${target.name}"?`
          : `Add patterns to "${target.name}"?`,
        descriptionParts.join(' '),
        [
          {
            label: target.tabGroups.length > 0 ? 'Merge tabs and rule' : 'Add to existing rule',
            value: 'merge',
            primary: true
          },
          { label: 'Do not merge', value: 'separate' }
        ]
      );
      if (choice === 'merge') return true;
      if (choice === 'separate') return false;
      return null;
    },
    requestUniqueName: showUniqueNameDialog
  };
}
