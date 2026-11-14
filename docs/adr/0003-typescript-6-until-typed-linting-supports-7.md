# TypeScript 6, not 7, until typed linting supports 7

TypeScript 7 (the native Go compiler) is stable, but typescript-eslint 8 supports only `typescript <6.1` because TS 7 ships no programmatic API until 7.1. We pin TypeScript 6.0 for both `tsc` and ESLint so type-checking and type-aware lint rules see the same types (typescript-eslint's own guidance), rather than running TS 7 for `tsc` beside a TS 6 alias for ESLint. Upgrade when typescript-eslint supports TS 7.
