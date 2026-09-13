let language = 'en';
function translate(next) {
  language = next;
  document.documentElement.lang = next === 'en' ? 'en' : 'zh-CN';
  document.querySelectorAll('[data-en]').forEach(element => { element.innerHTML = element.dataset[next]; });
  const toggle = document.querySelector('#language');
  toggle.textContent = next === 'en' ? '中文' : 'EN';
  toggle.setAttribute('aria-label', next === 'en' ? 'Switch to Chinese' : 'Switch to English');
  document.title = next === 'en' ? 'FormaBot — Your AI team, right at home.' : 'FormaBot — 你的 AI 团队，就在桌面。';
  document.querySelector('#readme').href = next === 'en' ? 'https://github.com/rouicezar/FormaBot#installation' : 'https://github.com/rouicezar/FormaBot/blob/main/README.zh-CN.md';

}
document.querySelector('#language').addEventListener('click', () => {
  translate(language === 'en' ? 'zh' : 'en');
  try { localStorage.setItem('formabot-site-language', language); } catch {}
});
try { if (localStorage.getItem('formabot-site-language') === 'zh') language = 'zh'; } catch {}
translate(language);
