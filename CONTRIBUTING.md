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

- **Kotlin:** Follow the official [Kotlin Coding Conventions](https://kotlinlang.org/docs/coding-conventions.html). We use `ktlint` to enforce this. The configuration is managed through the `ktlint-gradle` plugin in `build.gradle` and the `.editorconfig` file at the root of the project.
- **TypeScript:** Follow standard TypeScript best practices. We use ESLint and Prettier (configuration included in `package.json`).

## Documentation Requirements

Documentation is critical for project maintainability and must be kept up-to-date with code changes.

### Documentation Standards

- **API Documentation:** All Cloud Functions must have comprehensive API documentation including:
  - Function purpose and behavior
  - Input parameters with types and validation rules
  - Return values and error codes
  - Usage examples
  - Rate limiting and authentication requirements

- **Architecture Decision Records (ADRs):** Document significant architectural decisions in `/docs/adr/` using the format:
  - Title: Brief description of the decision
  - Status: Proposed, Accepted, Deprecated, or Superseded
  - Context: What is the issue that we're seeing?
  - Decision: What is the change that we're proposing?
  - Consequences: What becomes easier or more difficult?

- **Code Documentation:** 
  - Complex functions must have inline documentation
  - ViewModels and repositories require class-level documentation
  - Public APIs must have comprehensive documentation

### Documentation Quality Metrics

The following metrics are tracked to ensure documentation quality:

#### Coverage Metrics
- **API Documentation Coverage:** 100% of public Cloud Functions must have OpenAPI specs
- **Code Documentation Coverage:** All ViewModels, repositories, and complex functions must have documentation
- **User Documentation Coverage:** All user-facing features must have documentation

#### Quality Metrics
- **Documentation Freshness:** Documentation updates must be included in the same PR as code changes
- **Review Accuracy:** All documentation changes must be reviewed for accuracy during PR review
- **Link Validity:** All internal and external links must be validated monthly
- **Example Accuracy:** All code examples must be tested and working

#### Tracking Tools
- Use GitHub PR templates to ensure documentation checklist completion
- Monthly documentation review to identify gaps
- Automated link checking in CI pipeline (future implementation)
- Documentation build validation in CI pipeline

### OpenAPI Specification

- Cloud Functions serving as APIs must include OpenAPI 3.0 specifications
- Specifications should be maintained in `/docs/api/` directory
- Use tools like Swagger UI for documentation generation
- Include request/response examples and error scenarios

## Pull Request & Review Process

1.  Create your feature branch from `develop`.
2.  Make your changes and commit them following the convention.
3.  **Update documentation** as required by the PR template checklist.
4.  Ensure all tests pass (`npm test` for backend, Android tests in Android Studio).
5.  Verify documentation builds and renders correctly.
6.  Push your branch and open a Pull Request against `develop`.
7.  Complete the PR template checklist including documentation requirements.
8.  At least one other developer must approve the PR before it can be merged.

### Definition of Done

A Pull Request is considered complete only when:

#### Code Requirements
- [ ] All tests pass (unit, integration, E2E)
- [ ] Code follows established style guidelines
- [ ] Code review approval from at least one team member
- [ ] No linting errors or warnings

#### Documentation Requirements
- [ ] API changes include updated OpenAPI specifications
- [ ] New features include user documentation
- [ ] Complex logic includes inline documentation
- [ ] Architecture changes include ADR documentation
- [ ] README updates reflect new functionality
- [ ] Documentation builds without errors

#### Quality Assurance
- [ ] Manual testing completed for UI changes
- [ ] Security implications reviewed and documented
- [ ] Performance impact assessed and documented
- [ ] Accessibility guidelines followed for UI changes
