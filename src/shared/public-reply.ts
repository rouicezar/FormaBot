// Keep explicit reasoning channels out of public chat; length is a display concern.
export function publicReply(raw: string): string | undefined {
  const text = raw.replace(/<(think|thinking|analysis|reasoning)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(?:think|thinking|analysis|reasoning)\b[^>]*>[\s\S]*$/gi, '').trim();
  return text || undefined;
}
export const unavailableReply = '';
