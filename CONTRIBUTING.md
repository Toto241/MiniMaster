# Contributing to Mini-Master

We welcome contributions! Please follow these guidelines to ensure a smooth process.

## Branching Strategy

- **`main`:** This branch is for stable, released code only. Direct pushes are disabled.
- **`develop`:** This is the main development branch. All feature branches are merged into `develop`.
- **Feature Branches:** Create a new branch from `develop` for each new feature or bug fix (e.g., `feature/add-app-blocking`, `fix/login-bug`).

## Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. This helps automate changelogs and makes the project history easy to read.

- **Format:** `type(scope): subject`
- **Example:** `feat(masterApp): add subscription screen`
- **Example:** `fix(functions): prevent race condition in pairing`
- **Common Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

## Code Style

- **Kotlin:** Follow the official [Kotlin Coding Conventions](https://kotlinlang.org/docs/coding-conventions.html). We use `ktlint` to enforce this (configuration to be added).
- **TypeScript:** Follow standard TypeScript best practices. We use ESLint and Prettier (configuration included in `package.json`).

## Pull Request & Review Process

1.  Create your feature branch from `develop`.
2.  Make your changes and commit them following the convention.
3.  Ensure all tests pass (`npm test` for backend, Android tests in Android Studio).
4.  Push your branch and open a Pull Request against `develop`.
5.  Provide a clear description of your changes in the PR.
6.  At least one other developer must approve the PR before it can be merged.

---
*This is a placeholder document. Please adapt the guidelines to your team's workflow.*
