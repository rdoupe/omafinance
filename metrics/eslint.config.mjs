// Cyclomatic-complexity baseline for the plugin's JavaScript logic.
//
// This is intentionally a *standard* tool (ESLint's `complexity` rule), not a
// bespoke counter, so the number comes from an implementation we do not own.
// Config and reported output are both committed: changing a threshold or rule
// here shows up in `git diff`, so the metric cannot be quietly gamed.
//
// Regenerate the report from the repo root (pin the version to keep it stable):
//   npx --yes eslint@9.39.5 -c metrics/eslint.config.mjs -f json src/ > metrics/complexity.json
export default [
  {
    ignores: ["**/node_modules/**"]
  },
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "commonjs",
      globals: {
        module: "readonly",
        require: "readonly",
        exports: "readonly"
      }
    },
    rules: {
      // Report every function's cyclomatic complexity (threshold 1 = list all).
      complexity: ["warn", 1],
      "max-depth": ["warn", 4],
      "max-lines-per-function": ["warn", { max: 80, skipBlankLines: true, skipComments: true }],
      "max-statements": ["warn", 40],
      "max-nested-callbacks": ["warn", 4],
      "max-params": ["warn", 5]
    }
  }
]
