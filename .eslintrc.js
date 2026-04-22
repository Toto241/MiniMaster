module.exports = {
  root: true,
  env: {
    es2020: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:security/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.eslint.json"],
    sourceType: "module",
    ecmaVersion: 2020,
  },
  plugins: [
    "@typescript-eslint",
    "security",
    "import",
  ],
  overrides: [
    {
      files: ["shared-ui-tooltips.js", "start.js", "parent-panel/app.js", "child-panel/app.js"],
      env: {
        browser: true,
      },
      parserOptions: {
        project: null,
      },
      globals: {
        MutationObserver: "readonly",
        Node: "readonly",
        firebase: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        location: "readonly",
      },
    },
    {
      files: ["test/**/*.ts"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/unbound-method": "off",
      },
    },
  ],
  rules: {
    // Code style
    quotes: ["error", "double"],
    semi: ["error", "always"],
    "no-trailing-spaces": "error",
    "eol-last": ["error", "always"],
    "max-len": ["warn", { code: 120, ignoreUrls: true, ignoreStrings: true }],

    // TypeScript strictness
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-non-null-assertion": "warn",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    "@typescript-eslint/prefer-optional-chain": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/restrict-template-expressions": "warn",
    "@typescript-eslint/no-unnecessary-type-assertion": "error",
    "@typescript-eslint/prefer-as-const": "error",
    "@typescript-eslint/no-inferrable-types": "warn",

    // Security
    "security/detect-object-injection": "warn",
    "security/detect-non-literal-regexp": "warn",
    "security/detect-unsafe-regex": "error",
    "security/detect-buffer-noassert": "error",
    "security/detect-eval-with-expression": "error",
    "security/detect-no-csrf-before-method-override": "error",
    "security/detect-non-literal-require": "warn",
    "security/detect-non-literal-fs-filename": "warn",
    "security/detect-possible-timing-attacks": "warn",

    // Import
    "import/no-duplicates": "error",
    "import/order": ["warn", { alphabetize: { order: "asc" } }],
  },
};
