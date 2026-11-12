import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// The same rule set the Obsidian community directory runs on submissions.
export default defineConfig([
  // The Studio is a web app, not plugin code; the plugin rules do not apply to it.
  globalIgnores(["node_modules", "main.js", "test", "studio", "esbuild.config.mjs", "version-bump.mjs"]),
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
