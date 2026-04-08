# Repository-specific Copilot instructions

Apply the global user-level multi-agent system for complex work:
- System Orchestrator Runtime Layer v3
- Requirement Mapper v2
- Gap Closer Detailed v2
- Validator & Edge Case Checker v2
- Final Synthesizer v2

## Project rules
- inspect the existing architecture before editing
- preserve compatibility unless a breaking change is explicitly required
- prefer root-cause fixes over superficial patches
- validate modified code paths
- list assumptions explicitly
- separate REQUIRED work from OPTIONAL improvements
- do not silently invent missing behavior
- keep changes minimal, coherent, and testable

## Expected workflow
1. Map requirements and hidden dependencies
2. Implement the smallest correct change set
3. Validate behavior, edge cases, and integration
4. Synthesize only validated results
5. Record deferred optional improvements separately

## Output expectations
- concise execution status
- changed files
- validations performed
- remaining risks
- next recommended action