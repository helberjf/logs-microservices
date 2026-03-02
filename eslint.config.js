import prettier from "eslint-config-prettier";

export default [
  {
    ignores: ["node_modules/**"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    rules: { "no-console": "off" },
  },
  prettier,
];
