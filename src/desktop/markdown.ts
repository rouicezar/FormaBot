import { marked, Marked } from 'marked';
import DOMPurify from 'dompurify';

const chatMarkdown = new Marked({renderer:{html:({text})=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}});
export function renderMarkdown(target: HTMLElement, source: string, open?: (href: string) => void, literalHtml=false) {
  target.innerHTML = DOMPurify.sanitize((literalHtml?chatMarkdown:marked).parse(source, { async: false, breaks: true }), {
    ALLOWED_TAGS: ['p','br','strong','em','del','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','pre','code','table','thead','tbody','tr','th','td','hr','a'],
    ALLOWED_ATTR: ['href','title','start'],
  });
  target.querySelectorAll('a').forEach(link => {
    const href = link.getAttribute('href');
    link.onclick = event => { event.preventDefault(); if (href) open?.(href); };
  });
}
