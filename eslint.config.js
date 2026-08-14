import pluginVue from 'eslint-plugin-vue';
import tsParser from '@typescript-eslint/parser';
import vueParser from 'vue-eslint-parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';

const sharedRules = {
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'no-debugger': 'error',
  // ignoreRestSiblings: destructuring a field out of a rest spread is the
  // idiomatic "strip this property" pattern (e.g. saving a keychain entry
  // without its ephemeral `show` flag) — the removed binding is intentionally
  // unused.
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
  ...prettier.rules,
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['web/src/**/*.{js,ts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: sharedRules,
  },
  {
    // .vue files must go through vue-eslint-parser, which delegates the
    // <script> block to the TS parser; handing them to tsParser directly
    // fails on the <template> block ("Parsing error: '>' expected").
    files: ['web/src/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      vue: pluginVue,
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      ...sharedRules,
    },
  },
];
