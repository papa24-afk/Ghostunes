# Contributing to Ghosttunes

Thank you for your interest in contributing to Ghosttunes! We are building a high-fidelity, ad-free music player for the community, and we welcome improvements, bug fixes, and feature enhancements.

Please read this document before submitting contributions.

---

## Code of Conduct

By participating in this project, you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Please treat all community members with respect and kindness.

---

## How to Contribute

### 1. Fork and Branch Workflow

All external contributions must be submitted via pull requests from personal forks:

1. **Fork** the official repository: [papa24-afk/Ghostunes](https://github.com/papa24-afk/Ghostunes).
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/Ghostunes.git
   cd Ghostunes
   ```
3. **Configure the upstream remote**:
   ```bash
   git remote add upstream https://github.com/papa24-afk/Ghostunes.git
   ```
4. **Create a topic branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```

*Note: Never make changes directly on your fork's `main` branch. Keep your `main` branch synchronized with `upstream/main`.*

---

## Development Guidelines

### Setup

```bash
# Install dependencies
npm install

# Setup local environment
cp .env.example .env

# Run local development server
npm run dev

# Or run in full desktop Electron environment
npm run desktop:dev
```

### Code Style & Architecture

- **TypeScript:** Use strict types where possible. Avoid `any` when a known type or generic can be defined.
- **Components:** Functional components with React hooks. Keep components modular and reusable.
- **Styling:** Follow Tailwind CSS utility patterns consistent with the existing design system. Avoid arbitrary one-off inline styling when Tailwind classes exist.
- **State Management:** Keep state local when possible; share global playback state cleanly through established services.
- **Secrets:** Never commit API keys, personal credentials, or local environment files (`.env`).

---

## Quality Checks Before Submitting

Every Pull Request must pass the project's quality checks before it can be merged. Run these locally:

```bash
# 1. Run the test suite (SQLite engine & offline downloads)
npm test

# 2. Type check the TypeScript codebase
npx tsc --noEmit

# 3. Verify production Vite build
npm run build
```

---

## Commit Guidelines

We recommend [Conventional Commits](https://www.conventionalcommits.org/) format:

```text
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

### Examples:
- `feat(player): add volume curve normalization option`
- `fix(lyrics): resolve timestamp drift during gapless transitions`
- `docs(readme): add installation instructions for Windows 11`
- `refactor(database): optimize playlist track retrieval query`
- `test(engine): add assertions for concurrent download queueing`

---

## Submitting a Pull Request

1. Push your branch to your GitHub fork:
   ```bash
   git push origin feature/your-feature-name
   ```
2. Open a Pull Request against the official `main` branch.
3. Fill out the [Pull Request Template](.github/pull_request_template.md):
   - Provide a concise summary of the problem and your solution.
   - Attach screenshots or recordings if your changes affect the UI.
   - Confirm that all quality checks (`npm test`, `npx tsc --noEmit`, `npm run build`) pass.
4. Respond constructively to feedback during code review.
5. Once approved by the repository maintainer, your pull request will be merged into `main`.
