/**
 * A small POSIX-shell tokenizer for the Bash guard: splits a script into simple
 * commands (arrays of words, quotes removed), the way bash would before running them.
 *
 * Handles quotes, escapes, line continuations, comments, operators (; & && || | ( ) { }),
 * redirections, heredocs, command substitution ($(…) and backticks, parsed recursively)
 * and `bash -c` / `sh -c` / `eval` strings. It does not expand variables or globs:
 * words keep their literal `$VAR` text, which the guard treats conservatively.
 */

const SEPARATOR_WORDS = new Set(['{', '}', '!', 'then', 'do', 'else', 'elif', 'fi', 'done']);

interface Pending {
  delimiter: string;
  stripTabs: boolean;
}

/** Index just past the `)` that closes a `$(` whose content starts at `start`. */
function closingParen(script: string, start: number): number {
  let depth = 1;
  let i = start;
  while (i < script.length && depth > 0) {
    const ch = script[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === "'") {
      const end = script.indexOf("'", i + 1);
      i = end === -1 ? script.length : end + 1;
      continue;
    }
    if (ch === '"') {
      i++;
      while (i < script.length && script[i] !== '"') i += script[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    i++;
  }
  return i;
}

/** Index just past the closing backtick for a backtick substitution starting at `start`. */
function closingBacktick(script: string, start: number): number {
  let i = start;
  while (i < script.length && script[i] !== '`') i += script[i] === '\\' ? 2 : 1;
  return i + 1;
}

export function parseShell(script: string): string[][] {
  const commands: string[][] = [];
  let words: string[] = [];
  let word = '';
  let inWord = false;
  /** The next word is a redirection target or here-string, not part of the command. */
  let skipNextWord = false;
  /** The next word is a heredoc delimiter. */
  let heredocNext: { stripTabs: boolean } | null = null;
  let pending: Pending[] = [];
  let i = 0;

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
    if (words.length > 0) commands.push(words);
    words = [];
  };

  const substitute = (inner: string): void => {
    commands.push(...parseShell(inner));
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
          const end = closingParen(script, i + 2);
          substitute(script.slice(i + 2, end - 1));
          word += '$(…)';
          i = end;
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
      const end = closingParen(script, i + 2);
      substitute(script.slice(i + 2, end - 1));
      word += '$(…)';
      inWord = true;
      i = end;
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

    if (ch === ';' || ch === '&' || ch === '|' || ch === '(' || ch === ')') {
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

  // Unwrap `bash -c '…'`, `sh -c '…'`, `eval …` into the commands they run.
  return commands.flatMap((command) => {
    const [head, ...rest] = command;
    if (head === undefined) return [];
    if (head === 'eval') return [command, ...parseShell(rest.join(' '))];
    if (/^(?:.*\/)?(?:bash|sh|zsh|dash)$/.test(head)) {
      const flag = rest.findIndex((arg) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(arg));
      const body = flag === -1 ? undefined : rest[flag + 1];
      if (body !== undefined) return [command, ...parseShell(body)];
    }
    return [command];
  });
}
