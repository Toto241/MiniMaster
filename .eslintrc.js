module.exports = {
  root: true,
  env: {
    es2020: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    // plugin:security/recommended removed due to ESLint 8.x / plugin v2 config circularity issue;
    // security rules are defined manually below and the plugin remains in plugins[].
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
      files: ["**/*.ts"],
      extends: [
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
      ],
      rules: {
        // Typed rules downgraded to warn so Firestore any-typed data patterns don't block CI
        "@typescript-eslint/prefer-nullish-coalescing": "warn",
        "@typescript-eslint/prefer-optional-chain": "warn",
        "@typescript-eslint/no-floating-promises": "warn",
        "@typescript-eslint/await-thenable": "warn",
        "@typescript-eslint/no-misused-promises": "warn",
        "@typescript-eslint/restrict-template-expressions": "warn",
        "@typescript-eslint/no-unnecessary-type-assertion": "warn",
        "@typescript-eslint/prefer-as-const": "warn",
        "@typescript-eslint/no-unsafe-assignment": "warn",
        "@typescript-eslint/no-unsafe-member-access": "warn",
        "@typescript-eslint/no-unsafe-call": "warn",
        "@typescript-eslint/no-unsafe-argument": "warn",
        "@typescript-eslint/no-unsafe-return": "warn",
        "@typescript-eslint/no-base-to-string": "warn",
        "@typescript-eslint/require-await": "warn",
        "@typescript-eslint/no-explicit-any": "warn",
      },
    },
    {
      files: [
        "shared-ui-session-manager.js",
        "shared-ui-tooltips.js",
        "start.js",
        "parent-panel/app.js",
        "child-panel/app.js",
        "web-control/app.js",
        "admin-panel/app.js",
      ],
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
        // Test files exercise the backend through deliberately loosely-typed
        // mocks, fixtures and partial stubs, so the type-flow `no-unsafe-*`
        // family fires constantly without catching real defects (it accounted
        // for ~15k of ~18k warnings, all in test/). Disable it for tests only;
        // production code under src/ keeps these rules as `warn`.
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-argument": "off",
        "@typescript-eslint/no-unsafe-call": "off",
        "@typescript-eslint/no-unsafe-return": "off",
        // Object-injection is a heuristic that flags any computed member access;
        // in tests (bracket access into fixtures) it is pure noise.
        "security/detect-object-injection": "off",
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
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-non-null-assertion": "warn",
    "@typescript-eslint/no-inferrable-types": "warn",



    // Security
    "security/detect-object-injection": "warn",
    "security/detect-non-literal-regexp": "warn",
    "security/detect-unsafe-regex": "warn",
    "security/detect-buffer-noassert": "error",
    "security/detect-eval-with-expression": "error",
    "security/detect-no-csrf-before-method-override": "error",
    "security/detect-non-literal-require": "warn",
    "security/detect-non-literal-fs-filename": "warn",
    "security/detect-possible-timing-attacks": "warn",

    // Import
    "import/no-duplicates": "error",
  },
};
