export type TextHighlight = { id: string; region: string; start: number; end: number; quote: string; prefix: string; suffix: string };
export type TextSpan = { start: number; end: number };

export function anchorHighlight(text: string, region: string, start: number, end: number, id: string): TextHighlight {
  return { id, region, start, end, quote: text.slice(start, end), prefix: text.slice(Math.max(0, start - 32), start), suffix: text.slice(end, end + 32) };
}

/** Reattach only when the quote and its context identify a single location. */
export function resolveHighlight(text: string, saved: TextHighlight): TextSpan | null {
  if (!saved.quote) return null;
  const matches: number[] = [];
  for (let from = 0; from < text.length;) {
    const index = text.indexOf(saved.quote, from);
    if (index < 0) break;
    matches.push(index); from = index + 1;
  }
  const contextual = matches.filter((start) => (!saved.prefix || text.slice(0, start).endsWith(saved.prefix)) && (!saved.suffix || text.slice(start + saved.quote.length).startsWith(saved.suffix)));
  const start = contextual.length === 1 ? contextual[0] : matches.length === 1 ? matches[0] : undefined;
  return start === undefined ? null : { start, end: start + saved.quote.length };
}

export function spansOverlap(a: TextSpan, b: TextSpan): boolean { return a.start < b.end && b.start < a.end; }

export function addHighlight(saved: TextHighlight[], selected: TextHighlight, text: string): TextHighlight[] {
  let { start, end } = selected;
  const absorbed = new Set<string>();
  // Repeat so a growing selection absorbs connected overlapping ranges too.
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of saved) {
      if (item.region !== selected.region || absorbed.has(item.id)) continue;
      const span = resolveHighlight(text, item);
      if (span && spansOverlap({ start, end }, span)) {
        start = Math.min(start, span.start); end = Math.max(end, span.end);
        absorbed.add(item.id); changed = true;
      }
    }
  }
  const next = saved.filter((item) => !absorbed.has(item.id));
  if (next.length >= 100) throw new Error("You can save up to 100 highlights per question. Remove one before adding another.");
  return [...next, anchorHighlight(text, selected.region, start, end, selected.id)];
}

/** DOM offsets and string offsets both use UTF-16, including emoji and math. */
export function highlightRange(element: Element, span: TextSpan): Range | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0; let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!started && span.start < offset + length) { range.setStart(node, span.start - offset); started = true; }
    if (started && span.end <= offset + length) { range.setEnd(node, span.end - offset); return range; }
    offset += length;
  }
  return null;
}
