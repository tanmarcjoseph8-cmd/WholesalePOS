import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "dist-electron", "release"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["src/**/*.{ts,tsx}", "scripts/**/*.mjs", "vite.config.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } }
);
