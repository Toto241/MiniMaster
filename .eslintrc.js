module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['tsconfig.eslint.json'],
    sourceType: 'module',
  },
  plugins: [
    '@typescript-eslint',
  ],
  overrides: [
    {
      files: ['shared-ui-tooltips.js', 'start.js', 'parent-panel/app.js', 'child-panel/app.js'],
      env: {
        browser: true,
      },
      parserOptions: {
        project: null,
      },
      globals: {
        MutationObserver: 'readonly',
        Node: 'readonly',
        firebase: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
      },
    },
  ],
  rules: {
    'quotes': ['error', 'double'],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
};
