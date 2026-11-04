import js from "@eslint/js";
import globals from "globals";
import hooks from "eslint-plugin-react-hooks";
export default [
  {
    ignores: [
      "**/node_modules/**",
      "../frontend/dist/**",
      "test-results/**",
      "playwright-report/**",
      "storage/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["../frontend/src/**/*.{js,jsx}"],
    plugins: { "react-hooks": hooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  { files: ["**/*.cjs"], languageOptions: { sourceType: "commonjs" } },
];
