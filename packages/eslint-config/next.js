import base from './index.js';
import globals from 'globals';

/**
 * Flat-config preset for Next.js apps. We keep it minimal and rely on the
 * built-in next/core-web-vitals rules being applied via the legacy `extends`
 * field in the consuming app's eslint config (Next.js 16 still ships its
 * eslint preset in eslintrc form).
 */
export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
];
