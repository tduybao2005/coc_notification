export type IconName = 'settings' | 'back' | 'clipboard';

const SVG_NS = 'http://www.w3.org/2000/svg';

type Shape = [tag: 'path' | 'circle' | 'rect', attrs: Record<string, string>];

const SHAPES: Record<IconName, Shape[]> = {
  settings: [
    ['path', { d: 'M4 7h10M18 7h2M4 17h2M10 17h10' }],
    ['circle', { cx: '16', cy: '7', r: '2' }],
    ['circle', { cx: '8', cy: '17', r: '2' }],
  ],
  back: [['path', { d: 'M15 5l-7 7 7 7' }]],
  clipboard: [
    ['rect', { x: '8', y: '3', width: '8', height: '4', rx: '1' }],
    ['path', { d: 'M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2' }],
  ],
};

// Built with createElementNS, never from markup. Decorative: the button that holds it carries the label.
export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
  })) svg.setAttribute(key, value);
  for (const [tag, attrs] of SHAPES[name]) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, value);
    svg.append(shape);
  }
  return svg;
}
