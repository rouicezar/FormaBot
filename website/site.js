let language = 'en';
let stage = 0;
const messages = {
  en: ['A clear brief gives your teammate a place to start. Choose the next step below.', 'Reading the brief → preparing the draft. In the App, the conversation shows execution progress.', 'The sample draft is ready. Open the file to inspect the illustrative preview.'],
  zh: ['清晰的任务让成员知道从哪里开始。点击下方步骤继续。', '阅读简报 → 整理草稿。在 App 中，对话会显示执行过程。', '示例草稿已准备好。点击文件查看示意预览。']
};
const workbench = document.querySelector('.workbench');
function showStage(next) {
  stage = next;
  workbench.dataset.stage = String(stage);
  document.querySelector('#demo-message').textContent = messages[language][stage];
  document.querySelector('#file').hidden = stage !== 2;
  document.querySelectorAll('[data-step]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.step) === stage)));
}
function translate(next) {
  language = next;
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  document.querySelectorAll('[data-en]').forEach(element => { element.innerHTML = element.dataset[language]; });
  const toggle = document.querySelector('#language');
  toggle.textContent = language === 'en' ? '中文' : 'EN';
  toggle.setAttribute('aria-label', language === 'en' ? 'Switch to Chinese' : 'Switch to English');
  document.title = language === 'en' ? 'FormaBot — Give your ideas a team.' : 'FormaBot — 给你的想法，一支团队。';
  document.querySelector('#readme').href = language === 'en' ? 'https://github.com/rouicezar/FormaBot#installation' : 'https://github.com/rouicezar/FormaBot/blob/main/README.zh-CN.md';
  showStage(stage);
}
document.querySelector('#language').addEventListener('click', () => {
  translate(language === 'en' ? 'zh' : 'en');
  try { localStorage.setItem('formabot-site-language', language); } catch {}
});
document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => showStage(Number(button.dataset.step))));
document.querySelector('#file').addEventListener('click', () => {
  const preview = document.querySelector('.paper');
  preview.tabIndex = -1;
  preview.focus({preventScroll:true});
  preview.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
});
try { if (localStorage.getItem('formabot-site-language') === 'zh') language = 'zh'; } catch {}
translate(language);
