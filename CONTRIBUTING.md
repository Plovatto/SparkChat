# Contributing

Thanks for helping improve SparkChat. By taking part, you agree to follow the [code of conduct](CODE_OF_CONDUCT.md).

## Reporting problems

Open an [issue](https://github.com/Plovatto/SparkChat/issues/new/choose) with the problem, the steps to reproduce it, and the expected behavior. Server, authentication, and upload problems belong in the [API repository](https://github.com/Plovatto/API-SparkChat/issues). Report security issues through the [security policy](SECURITY.md).

## Sending changes

1. Create a branch from `main` with a prefix for the type of change: `feature/`, `fix/`, `chore/`, or `docs/`.
2. Write commits in the [gitmoji](https://gitmoji.dev/) format with [Conventional Commits](https://www.conventionalcommits.org/), for example `:bug: fix: keep the link preview after a reconnection`.
3. Add tests for new features and bug fixes.
4. Before opening the pull request, run `npm run lint`, `npm run typecheck`, and `npm test`.
5. Open the pull request against `main` describing what was done, the details, and how it was tested. Its title follows the same format as the commits, and a check validates it.

Notable changes are recorded in the [changelog](CHANGELOG.md).
