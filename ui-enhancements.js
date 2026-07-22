(() => {
  const CHECK_ICON = '<span aria-hidden="true"><svg viewBox="0 0 12 10" height="10" width="12"><polyline points="1.5 6 4.5 9 10.5 1"></polyline></svg></span>';
  const DELETE_ICON = '<svg viewBox="0 0 448 512" class="deleteIcon" aria-hidden="true"><path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"></path></svg>';
  let checkboxSequence = 0;
  let scheduled = false;

  function nextCheckboxId() {
    checkboxSequence += 1;
    return 'styled-cbx-' + checkboxSequence;
  }

  function createCheckboxLabel(input, text = '') {
    if (!input.id) input.id = nextCheckboxId();
    input.classList.add('inp-cbx');

    const label = document.createElement('label');
    label.className = 'cbx';
    label.htmlFor = input.id;
    label.innerHTML = CHECK_ICON + (text ? '<span class="cbx-text">' + text + '</span>' : '');
    return label;
  }

  function decorateTableCheckbox(input) {
    if (input.closest('.checkbox-wrapper-46')) return;
    const parent = input.parentElement;
    if (!parent) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'checkbox-wrapper-46';
    parent.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    wrapper.appendChild(createCheckboxLabel(input));
  }

  function decorateColumnCheckbox(input) {
    if (input.closest('.checkbox-wrapper-46')) return;
    const oldLabel = input.parentElement;
    if (!oldLabel || oldLabel.tagName !== 'LABEL') return;

    const textNode = oldLabel.querySelector('span');
    const text = textNode ? textNode.innerHTML : oldLabel.textContent.trim();
    const wrapper = document.createElement('div');
    wrapper.className = 'checkbox-wrapper-46';

    oldLabel.replaceWith(wrapper);
    wrapper.appendChild(input);
    const label = createCheckboxLabel(input);
    if (text) {
      const textSpan = document.createElement('span');
      textSpan.className = 'cbx-text';
      textSpan.innerHTML = text;
      label.appendChild(textSpan);
    }
    wrapper.appendChild(label);
  }

  function decorateCheckboxes() {
    document.querySelectorAll('th.select-col input[type="checkbox"], td.select-col input[type="checkbox"]').forEach(decorateTableCheckbox);
    document.querySelectorAll('#colPanel > label > input[type="checkbox"]').forEach(decorateColumnCheckbox);
  }

  function decorateFloatingFields() {
    document.querySelectorAll('.protocol-drug-fields .protocol-field').forEach(field => {
      if (field.classList.contains('floating-field')) return;
      const control = field.querySelector('input, textarea');
      const label = field.querySelector('label');
      if (!control || !label) return;

      const example = control.getAttribute('placeholder') || '';
      control.setAttribute('placeholder', ' ');
      field.classList.add('floating-field');
      control.insertAdjacentElement('afterend', label);

      if (example && example.trim()) {
        const hint = document.createElement('span');
        hint.className = 'floating-hint';
        hint.textContent = example;
        field.appendChild(hint);
      }
    });
  }

  function decorateDeleteButton(button, label) {
    if (button.classList.contains('deleteButton')) return;
    button.classList.remove('btn-danger', 'protocol-remove');
    button.classList.add('deleteButton');
    button.dataset.label = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = DELETE_ICON;
  }

  function decorateDeleteButtons() {
    document.querySelectorAll('[data-remove-index]').forEach(button => decorateDeleteButton(button, 'Hiqe'));
    document.querySelectorAll('[data-delete-protocol]').forEach(button => decorateDeleteButton(button, 'Fshije'));
  }

  function decorateAll() {
    scheduled = false;
    decorateCheckboxes();
    decorateFloatingFields();
    decorateDeleteButtons();
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorateAll);
  }

  const observer = new MutationObserver(scheduleDecorate);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', decorateAll, { once: true });
  } else {
    decorateAll();
  }
})();
