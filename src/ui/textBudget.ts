// Browser-test helper for the text budget (CODING_STANDARDS.md, "Show, don't tell"): at most one short
// line of visible prose per panel. It reads what a player sees, so text behind a closed "Tell me more"
// or "?", and screen-reader-only text, does not count.

/** A run of this many words is prose even without a full stop: "Low chance: may run dry". */
const PROSE_WORDS = 5;

/** Labels and values joined by a middle dot ("Moon of Cinder · 0.1 m/s²") are separate items. */
const ITEM_BREAK = /(?<=[.!?])\s+|\s·\s/;

/** Whether the player sees this element's text: rendered, not hidden, and not for screen readers only. */
function isSeen(el: Element): boolean {
  if (el.closest('.sr-only, [aria-hidden="true"]')) return false;
  return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
}

/** The nearest box that holds `el` as one run of text: its closest ancestor that is not inline. */
function blockOf(el: Element, root: Element): Element {
  let block = el;
  while (block !== root && block.parentElement && getComputedStyle(block).display === 'inline') {
    block = block.parentElement;
  }
  return block;
}

const wordsIn = (text: string): number =>
  text.split(/\s+/).filter((word) => /\p{L}/u.test(word)).length;

/** A sentence ends in . ! or ? with at least two words, or runs to five words; labels and numbers do not. */
function isSentence(text: string): boolean {
  const words = wordsIn(text);
  return words >= PROSE_WORDS || (/[.!?]$/.test(text) && words >= 2);
}

/** The sentences a player sees in these panels, in page order. */
export function visibleSentences(...roots: readonly HTMLElement[]): string[] {
  const blocks = new Map<Element, string>();
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !isSeen(parent)) continue;
      const block = blockOf(parent, root);
      blocks.set(block, (blocks.get(block) ?? '') + (node.textContent ?? ''));
    }
  }
  return [...blocks.values()]
    .flatMap((text) => text.replace(/\s+/g, ' ').trim().split(ITEM_BREAK))
    .map((item) => item.trim())
    .filter(isSentence);
}

/** Throws, naming the sentences, when these panels show more visible sentences than `budget`. */
export function expectTextBudget(root: HTMLElement | readonly HTMLElement[], budget = 1): void {
  const roots: readonly HTMLElement[] = root instanceof HTMLElement ? [root] : root;
  const sentences = visibleSentences(...roots);
  if (sentences.length > budget) {
    throw new Error(
      `${String(sentences.length)} visible sentences, over the budget of ${String(budget)}:\n` +
        sentences.map((s) => `  - ${s}`).join('\n'),
    );
  }
}
