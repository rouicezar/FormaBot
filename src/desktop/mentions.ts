import type { Conversation } from '../shared/contracts';
import { identityAvatar } from './identity';

/** Composer-local completion; never sends a message or changes the executor. */
export function installMentions(input: HTMLTextAreaElement, members: () => Conversation[]) {
  const menu = document.createElement('div');
  menu.id = 'mention-menu'; menu.role = 'listbox'; menu.hidden = true;
  Object.assign(menu.style, { position: 'fixed', zIndex: '100', width: '240px', maxHeight: '240px', overflowY: 'auto', background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '5px', boxShadow: '0 8px 28px #0002' });
  document.body.append(menu);
  input.setAttribute('aria-controls', menu.id); input.setAttribute('aria-autocomplete', 'list');
  let start = -1, end = 0, selected = 0, composing = false, choices: Conversation[] = [];
  function close() { menu.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  function choose(index: number) {
    const member = choices[index]; if (!member) return;
    input.setRangeText(`@${member.name} `, start, end, 'end'); close(); input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function highlight() {
    [...menu.children].forEach((node, i) => { const option = node as HTMLElement; option.style.background = i === selected ? '#f0f0f0' : 'transparent'; option.setAttribute('aria-selected', String(i === selected)); });
    const active = menu.children[selected] as HTMLElement | undefined;
    if (active) { input.setAttribute('aria-activedescendant', active.id); active.scrollIntoView({ block: 'nearest' }); }
  }
  function position() {
    // Mirror wrapping, typography and scroll to locate the text caret rather than the mouse.
    const rect = input.getBoundingClientRect(), style = getComputedStyle(input), mirror = document.createElement('div');
    for (const name of ['font', 'line-height', 'letter-spacing', 'padding', 'border', 'box-sizing', 'word-spacing', 'tab-size']) mirror.style.setProperty(name, style.getPropertyValue(name));
    Object.assign(mirror.style, { position: 'fixed', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: `${rect.width}px`, left: `${rect.left}px`, top: `${rect.top}px` });
    mirror.textContent = input.value.slice(0, input.selectionStart);
    const marker = document.createElement('span'); marker.textContent = '\u200b'; mirror.append(marker); document.body.append(mirror);
    const caret = marker.getBoundingClientRect(); mirror.remove();
    const x = caret.left - input.scrollLeft, y = caret.top - input.scrollTop;
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - 256))}px`;
    const height = Math.min(menu.scrollHeight, 240);
    menu.style.top = `${Math.max(8, y + 28 + height > innerHeight ? y - height - 8 : y + 28)}px`;
  }
  function update() {
    if (composing || document.activeElement !== input || input.selectionStart !== input.selectionEnd) { close(); return; }
    const match = /(?:^|[\s，。,:：！!（(])@([^@\s，。,:：！!()]*)$/.exec(input.value.slice(0, input.selectionStart));
    if (!match) { close(); return; }
    const query = match[1].toLocaleLowerCase(); end = input.selectionStart; start = end - query.length - 1;
    choices = members().filter(member => member.name.toLocaleLowerCase().includes(query)); selected = 0;
    menu.replaceChildren(); if (!choices.length) { close(); return; }
    choices.forEach((member, index) => {
      const option = document.createElement('div'); option.id = `mention-option-${index}`; option.role = 'option';
      Object.assign(option.style, { display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '7px', cursor: 'pointer', fontSize: '13px' });
      option.append(identityAvatar(member.id, 'bot'), document.createTextNode(member.name));
      option.onmousedown = event => { event.preventDefault(); choose(index); }; menu.append(option);
    });
    menu.hidden = false; input.setAttribute('aria-expanded', 'true'); highlight(); position();
  }
  input.addEventListener('input', update); input.addEventListener('click', update); input.addEventListener('keyup', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) update(); });
  input.addEventListener('compositionstart', () => { composing = true; close(); });
  input.addEventListener('compositionend', () => { composing = false; update(); });
  input.addEventListener('keydown', event => {
    if (menu.hidden || composing || event.isComposing || event.keyCode === 229 || event.shiftKey || event.metaKey || event.ctrlKey) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length; highlight(); }
    else if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); choose(selected); }
  });
  input.addEventListener('blur', close); input.addEventListener('scroll', () => { if (!menu.hidden) position(); });
  window.addEventListener('resize', close);
  return { close, open: () => { input.focus(); input.setRangeText('@', input.selectionStart, input.selectionEnd, 'end'); input.dispatchEvent(new Event('input', { bubbles: true })); } };
}
