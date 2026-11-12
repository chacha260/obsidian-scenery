import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// The same rule set the Obsidian community directory runs on submissions.
export default defineConfig([
  globalIgnores(["node_modules", "main.js", "test", "esbuild.config.mjs", "version-bump.mjs"]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mjs"],
        },
      },
    },
  },
]);
