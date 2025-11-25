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
    project: ['tsconfig.json'],
    sourceType: 'module',
  },
  plugins: [
    '@typescript-eslint',
  ],
  // ignorePatterns is not a valid property inside .eslintrc.js for older versions if not handled correctly,
  // or maybe it is valid but there is a version mismatch.
  // However, standard practice is to put it here or in .eslintignore.
  // The error said "Unexpected top-level property".
  // Let's remove it from here and create .eslintignore if needed, or just rely on the error message being weird.
  // Actually, ignorePatterns IS valid in .eslintrc.js for ESLint 8.
  // The error might be coming from an even older eslint or something strange.
  // Let's try removing it and use .eslintignore.
  rules: {
    'quotes': ['error', 'double'],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
};
