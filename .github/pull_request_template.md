## Description
Brief description of the changes made and the issue being addressed.

Fixes #(issue_number)

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Performance improvement
- [ ] Test coverage improvement

## Code Quality Checklist
- [ ] All tests pass locally (`npm test` for backend, Android tests)
- [ ] Code follows the project's style guidelines
- [ ] Code has been reviewed by myself before submission
- [ ] No new linting errors or warnings introduced
- [ ] Error handling is appropriate and consistent

## Documentation Checklist
- [ ] **API Documentation**: OpenAPI specs updated for any API changes (in `/docs/api/`)
- [ ] **Architecture Changes**: ADR created for significant architectural decisions (in `/docs/adr/`)
- [ ] **Code Documentation**: Complex functions and classes have inline documentation
- [ ] **User Documentation**: README or user guides updated for new features
- [ ] **Deployment Documentation**: RUNBOOK.md updated if deployment processes change
- [ ] **Security Documentation**: SECURITY.md updated for security-related changes
- [ ] **Changelog**: CHANGELOG.md updated following Keep a Changelog format

## Testing Checklist
- [ ] **Unit Tests**: New or modified code has corresponding unit tests
- [ ] **Integration Tests**: API changes include integration test coverage
- [ ] **Manual Testing**: UI changes manually tested across different scenarios
- [ ] **Edge Cases**: Edge cases and error scenarios tested
- [ ] **Performance**: No significant performance degradation introduced

## Security & Quality Assurance
- [ ] **Security Review**: Security implications assessed and documented
- [ ] **Accessibility**: UI changes follow accessibility guidelines (if applicable)
- [ ] **Internationalization**: New text includes proper localization support (if applicable)
- [ ] **Database Changes**: Database migrations are safe and reversible (if applicable)
- [ ] **Environment Vars**: New environment variables documented in deployment guides

## Screenshots (if applicable)
Add screenshots or videos demonstrating UI changes or new functionality.

## Additional Notes
Any additional information that reviewers should know about this PR.

---

**Reviewer Guidelines:**
- Verify all checkboxes are completed
- Ensure documentation is accurate and up-to-date
- Check that architectural decisions are properly documented
- Validate that security implications are addressed
- Confirm testing coverage is adequate