import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// The same rule set the Obsidian community directory runs on submissions.
export default defineConfig([
  // The Studio is linted too: the community directory scans the whole repository.
  globalIgnores(["node_modules", "main.js", "test", "studio/dist", "studio/build.mjs", "esbuild.config.mjs", "version-bump.mjs"]),
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
