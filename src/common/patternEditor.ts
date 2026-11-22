export interface PatternEditor {
  getPatternValues(): string[];
  setPatterns(patterns: string[]): void;
}

export function setupPatternEditor(list: HTMLElement, addButton: HTMLButtonElement): PatternEditor {
  function getInputs(): HTMLTextAreaElement[] {
    return Array.from(list.querySelectorAll<HTMLTextAreaElement>('.pattern-input'));
  }

  function updateControls(): void {
    const inputs = getInputs();
    list.querySelectorAll<HTMLButtonElement>('.pattern-remove-btn').forEach((button) => {
      button.hidden = inputs.length <= 1;
    });
  }

  function appendPattern(value = ''): void {
    const row = document.createElement('div');
    row.className = 'pattern-input-row';

    const input = document.createElement('textarea');
    input.className = 'input-textarea pattern-input';
    input.rows = 1;
    input.value = value;
    input.placeholder = 'URL pattern (e.g. example.com/path*)';
    input.required = true;
    input.setAttribute('aria-label', 'URL pattern');

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'icon-btn pattern-remove-btn';
    removeButton.textContent = '×';
    removeButton.title = 'Remove pattern';
    removeButton.setAttribute('aria-label', 'Remove pattern');

    row.appendChild(input);
    row.appendChild(removeButton);
    list.appendChild(row);
  }

  list.addEventListener('input', updateControls);
  list.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const removeButton = target.closest<HTMLButtonElement>('.pattern-remove-btn');
    if (!removeButton || getInputs().length <= 1) return;

    removeButton.closest('.pattern-input-row')?.remove();
    updateControls();
  });

  addButton.addEventListener('click', () => {
    appendPattern();
    updateControls();
    getInputs()[getInputs().length - 1].focus();
  });

  return {
    getPatternValues: () => getInputs().map((input) => input.value),
    setPatterns: (patterns) => {
      list.replaceChildren();
      (patterns.length ? patterns : ['']).forEach((pattern) => appendPattern(pattern));
      updateControls();
    }
  };
}
