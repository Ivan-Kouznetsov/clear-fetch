# Contributing to clear-fetch

Thank you for your interest in contributing to `clear-fetch`! We welcome bug reports, feature requests, and pull requests to help improve this utility.

---

## Development Setup

To set up a local development environment:

1. **Clone the repository**:

   ```bash
   git clone https://github.com/Ivan-Kouznetsov/clear-fetch.git
   cd clear-fetch
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Build the project**:
   Compile TypeScript source files into JavaScript inside the `dist/` directory:

   ```bash
   npm run build
   ```

   You can also clean existing build artifacts before compiling:

   ```bash
   npm run clean
   ```

---

## Running Tests

We maintain strict test coverage with unit and integration test suites. Before submitting any changes, make sure all tests pass.

- **Run all tests**:

  ```bash
  npm test
  ```

- **Run unit tests only**:

  ```bash
  npm run test:unit
  ```

- **Run integration tests only**:
  ```bash
  npm run test:integration
  ```
  _(Note: The integration tests run against a local test server located in `test/util/server.mjs`, ensuring tests run entirely locally without external network dependencies)._

---

## Coding Standards

- **TypeScript**: The source code is written in TypeScript. Use standard typing patterns and avoid `any` when possible.
- **ES Modules (ESM)**: This project is an ESM package. All internal imports must specify the `.js` file extension (e.g. `import { db } from './db.js'`) as mandated by the `NodeNext` module resolution configuration.
- **No Console Logging**: Do not include raw `console.log` statements in source modules.
- **Testing**: Write unit or integration tests for any new features or bug fixes.

---

## Pull Request Guidelines

1. **Branch Naming**: Use descriptive branch names (e.g. `feat/some-feature` or `fix/some-bug`).
2. **Clean Commits**: Commit messages should be clear and concise.
3. **Run Tests**: Ensure `npm test` runs successfully locally before opening the PR.
4. **Submit PR**: Provide a clear description of the problem solved or the feature introduced in your pull request.
