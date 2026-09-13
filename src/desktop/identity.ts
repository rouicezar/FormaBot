const colors = ['#167c91','#7755b5','#b35d20','#267c55','#c04770','#366fbd','#8b7521','#a84c40','#6860b8','#247e75','#aa508f','#526b88'];
// Small silhouettes carry the identity themselves; no tile behind the avatar.
const silhouettes: Record<string, string[]> = {
  bot: [
    'M5 5C8 2 17 3 20 7S23 18 18 20 6 22 3 17 2 8 5 5Z',
    'M12 2C15 4 21 11 21 15a9 7 0 0 1-18 0C3 11 9 4 12 2Z',
    'M7 3h10l5 9-5 9H7L2 12 7 3Z',
    'M12 2 22 10 18 21H6L2 10 12 2Z',
    'M5 4C8 1 12 5 14 4s7 0 7 5-4 5-3 8-5 7-8 3-8-3-8-7 4-5 3-9Z',
    'M12 2 21 6v8c0 4-6 7-9 8-3-1-9-4-9-8V6l9-4Z',
    'M5 4h14l3 8-3 8H5l-3-8 3-8Z',
  ],
  group: [
    'M3 7a5 5 0 0 1 8-4 5 5 0 0 1 9 4 6 6 0 0 1-1 12 5 5 0 0 1-8 2 6 6 0 0 1-8-8 5 5 0 0 1 0-6Z',
    'M12 2 21 7v10l-9 5-9-5V7l9-5Z',
    'M5 3h9a4 4 0 0 1 4 4v2h2v11H9v-2H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z',
    'M12 2 16 6 22 7l-1 7-4 7-5-2-5 2-4-7-1-7 6-1 4-4Z',
    'M12 3c3-4 8 0 7 4 6 0 6 8 1 9 0 6-8 8-9 3-6 3-12-2-7-7-4-5 2-11 8-9Z',
  ],
};
type Identity = { color: number; symbol: number; kind: string };
const storageKey = 'formabot.visual-identities.v1';
let identities: Record<string, Identity> = {};
try { identities = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { /* Rebuild missing UI preferences. */ }

export function identityAvatar(id: string, kind = 'bot') {
  let value = identities[id];
  if (!value || value.kind !== kind) {
    const existing = Object.values(identities);
    const leastUsed = (count: number, uses: (n: number) => number) =>
      Array.from({length: count}, (_, i) => i).sort((a,b) => uses(a)-uses(b))[0];
    value = {
      kind,
      color: leastUsed(colors.length, n => existing.filter(v => v.color === n).length),
      symbol: leastUsed(silhouettes[kind].length, n => existing.filter(v => v.kind === kind && v.symbol === n).length),
    };
    identities[id] = value;
    localStorage.setItem(storageKey, JSON.stringify(identities));
  }
  const node = document.createElement('span');
  node.className = `avatar identity-avatar${kind === 'group' ? ' group' : ''}`;
  node.setAttribute('aria-hidden', 'true');
  node.style.setProperty('--identity-color', colors[value.color]);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const shape = document.createElementNS(svg.namespaceURI, 'path');
  shape.setAttribute('d', silhouettes[kind][value.symbol]);
  shape.setAttribute('fill', 'currentColor');
  svg.append(shape);
  // A shared face makes these readable as characters, not toolbar symbols.
  for (const x of kind === 'group' ? [7, 12, 17] : [9, 15]) {
    const eye = document.createElementNS(svg.namespaceURI, 'path');
    eye.setAttribute('d', `M${x} 10l1 3`);
    eye.setAttribute('stroke', 'white');
    eye.setAttribute('stroke-width', '1.5');
    eye.setAttribute('stroke-linecap', 'round');
    svg.append(eye);
  }
  node.dataset.memberId=id;node.title=kind==='group'?'群组':'Bot';
  node.append(svg);
  return node;
}
