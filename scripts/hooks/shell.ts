/**
 * A small POSIX-shell tokenizer for the Bash guard: splits a script into simple
 * commands (arrays of words, quotes removed), the way bash would before running them.
 *
 * Handles quotes, escapes, line continuations, comments, operators (; & && || | ( ) { }),
 * redirections, heredocs, command substitution ($(…) and backticks, parsed recursively)
 * and `bash -c` / `sh -c` / `eval` strings. It does not expand variables or globs:
 * words keep their literal `$VAR` text, which the guard treats conservatively.
 */

const SEPARATOR_WORDS = new Set([
  '{',
  '}',
  '!',
  'if',
  'then',
  'elif',
  'else',
  'fi',
  'while',
  'until',
  'do',
  'done',
]);

interface Pending {
  delimiter: string;
  stripTabs: boolean;
}

/** Index just past the closing backtick for a backtick substitution starting at `start`. */
function closingBacktick(script: string, start: number): number {
  let i = start;
  while (i < script.length && script[i] !== '`') i += script[i] === '\\' ? 2 : 1;
  return i + 1;
}

/**
 * One step of a parsed script: a simple command, or the boundary of a subshell scope
 * (`( … )`, `$( … )`, backticks, `bash -c`). A `cd` inside a scope ends at its `exit`.
 */
export type ShellItem = { words: string[] } | { scope: 'enter' | 'exit' };

/** Commands in execution order, with subshell boundaries kept so callers can scope `cd`. */
export function parseScoped(script: string): ShellItem[] {
  // Unwrap `bash -c '…'`, `sh -c '…'`, `eval …` into the commands they run.
  return lex(script, 0, false).items.flatMap((item): ShellItem[] => {
    if (!('words' in item)) return [item];
    const [head, ...rest] = item.words;
    if (head === undefined) return [];
    if (head === 'eval') return [item, ...parseScoped(rest.join(' '))];
    if (/^(?:.*\/)?(?:bash|sh|zsh|dash)$/.test(head)) {
      const flag = rest.findIndex((arg) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(arg));
      const body = flag === -1 ? undefined : rest[flag + 1];
      if (body !== undefined) {
        return [item, { scope: 'enter' }, ...parseScoped(body), { scope: 'exit' }];
      }
    }
    return [item];
  });
}

/** Every simple command in `script`, flattened (no scope information). Test-only: the guard uses `parseScoped`. */
export function parseShell(script: string): string[][] {
  return parseScoped(script).flatMap((item) => ('words' in item ? [item.words] : []));
}

/**
 * Lex from `start`. Inside a `$(…)` substitution, stop at its unmatched `)` and report
 * where it ended, so heredocs and quotes inside the substitution are lexed by these
 * same rules rather than a second scanner.
 */
function lex(
  script: string,
  start: number,
  inSubstitution: boolean,
): { items: ShellItem[]; end: number } {
  const items: ShellItem[] = [];
  let depth = 0;
  let words: string[] = [];
  let word = '';
  let inWord = false;
  /** The next word is a redirection target or here-string, not part of the command. */
  let skipNextWord = false;
  /** The next word is a heredoc delimiter. */
  let heredocNext: { stripTabs: boolean } | null = null;
  let pending: Pending[] = [];
  let i = start;

  const endWord = (): void => {
    if (!inWord) return;
    if (heredocNext) {
      pending.push({ delimiter: word, stripTabs: heredocNext.stripTabs });
      heredocNext = null;
    } else if (skipNextWord) {
      skipNextWord = false;
    } else if (SEPARATOR_WORDS.has(word) && words.length === 0) {
      // Reserved word at command start: not a command itself.
    } else {
      words.push(word);
    }
    word = '';
    inWord = false;
  };

  const endCommand = (): void => {
    endWord();
    if (words.length > 0) items.push({ words });
    words = [];
  };

  const substitute = (inner: string): void => {
    items.push({ scope: 'enter' }, ...parseScoped(inner), { scope: 'exit' });
  };

  /** Lex the `$(…)` whose content starts at `from`; returns the index after its `)`. */
  const substitution = (from: number): number => {
    const inner = lex(script, from, true);
    items.push({ scope: 'enter' }, ...inner.items, { scope: 'exit' });
    return inner.end;
  };

  const skipHeredocBodies = (): void => {
    for (const { delimiter, stripTabs } of pending) {
      while (i < script.length) {
        const lineEnd = script.indexOf('\n', i);
        const end = lineEnd === -1 ? script.length : lineEnd;
        let line = script.slice(i, end);
        if (stripTabs) line = line.replace(/^\t+/, '');
        i = end + 1;
        if (line === delimiter) break;
      }
    }
    pending = [];
  };

  while (i < script.length) {
    const ch = script[i] ?? '';
    const next = script[i + 1] ?? '';

    if (ch === '\\') {
      if (next === '\n') {
        i += 2; // line continuation
        continue;
      }
      word += next;
      inWord = true;
      i += 2;
      continue;
    }

    if (ch === "'") {
      const end = script.indexOf("'", i + 1);
      word += script.slice(i + 1, end === -1 ? script.length : end);
      inWord = true;
      i = end === -1 ? script.length : end + 1;
      continue;
    }

    if (ch === '$' && next === "'") {
      const end = script.indexOf("'", i + 2);
      word += script.slice(i + 2, end === -1 ? script.length : end);
      inWord = true;
      i = end === -1 ? script.length : end + 1;
      continue;
    }

    if (ch === '"') {
      i++;
      while (i < script.length && script[i] !== '"') {
        const c = script[i] ?? '';
        if (c === '\\' && i + 1 < script.length) {
          const escaped = script[i + 1] ?? '';
          word += '$`"\\\n'.includes(escaped) ? (escaped === '\n' ? '' : escaped) : c + escaped;
          i += 2;
        } else if (c === '$' && script[i + 1] === '(') {
          i = substitution(i + 2);
          word += '$(…)';
        } else if (c === '`') {
          const end = closingBacktick(script, i + 1);
          substitute(script.slice(i + 1, end - 1));
          word += '$(…)';
          i = end;
        } else {
          word += c;
          i++;
        }
      }
      inWord = true;
      i++;
      continue;
    }

    if (ch === '$' && next === '(') {
      i = substitution(i + 2);
      word += '$(…)';
      inWord = true;
      continue;
    }

    if (ch === '`') {
      const end = closingBacktick(script, i + 1);
      substitute(script.slice(i + 1, end - 1));
      word += '$(…)';
      inWord = true;
      i = end;
      continue;
    }

    if (ch === '#' && !inWord) {
      while (i < script.length && script[i] !== '\n') i++;
      continue;
    }

    if (ch === '\n') {
      endCommand();
      i++;
      if (pending.length > 0) skipHeredocBodies();
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      endWord();
      i++;
      continue;
    }

    if (ch === '<' && next === '<') {
      endWord();
      if (script[i + 2] === '<') {
        skipNextWord = true; // here-string
        i += 3;
      } else {
        const stripTabs = script[i + 2] === '-';
        heredocNext = { stripTabs };
        i += stripTabs ? 3 : 2;
      }
      continue;
    }

    if (ch === '>' || ch === '<') {
      // A bare fd number right before the operator (2>…) belongs to the redirection.
      if (inWord && /^\d+$/.test(word)) {
        word = '';
        inWord = false;
      }
      endWord();
      i++;
      if (script[i] === '>' || script[i] === '&' || script[i] === '|') i++;
      skipNextWord = true;
      continue;
    }

    if (ch === '&' && next === '>') {
      endWord();
      i += script[i + 2] === '>' ? 3 : 2;
      skipNextWord = true;
      continue;
    }

    if (ch === '(') {
      endCommand();
      items.push({ scope: 'enter' });
      depth++;
      i++;
      continue;
    }

    if (ch === ')') {
      endCommand();
      i++;
      if (depth > 0) {
        depth--;
        items.push({ scope: 'exit' });
      } else if (inSubstitution) return { items, end: i };
      continue;
    }

    if (ch === ';' || ch === '&' || ch === '|') {
      endCommand();
      i +=
        (ch === '&' && next === '&') ||
        (ch === '|' && (next === '|' || next === '&')) ||
        (ch === ';' && next === ';')
          ? 2
          : 1;
      continue;
    }

    word += ch;
    inWord = true;
    i++;
  }
  endCommand();
  return { items, end: i };
}
