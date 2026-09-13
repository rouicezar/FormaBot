import { t, setLocale, type Locale, type MessageKey } from '../shared/i18n';

// Only explicitly annotated UI labels are translated; user text is never inspected.
export function localizeDocument(locale: Locale) {
  setLocale(locale);
  document.documentElement.lang = locale;
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const text = t(node.dataset.i18n as MessageKey);
    const label = [...node.childNodes].find(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim());
    if (label) label.textContent = text;
  }
  for (const attribute of ['aria-label', 'title', 'placeholder', 'alt']) {
    for (const node of document.querySelectorAll<HTMLElement>(`[data-i18n-${attribute}]`)) {
      node.setAttribute(attribute, t(node.getAttribute(`data-i18n-${attribute}`) as MessageKey));
    }
  }
}
