// eslint-disable-next-line
const path = require("path");

module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: path.join(__dirname, "tsconfig.json"),
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
  ],
  plugins: ["@typescript-eslint", "prettier"],
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  rules: {
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "prettier/prettier": "error",
  },
  overrides: [
    {
      files: ["*.js"],
      parserOptions: { project: null },
    },
    {
      // Tests live outside the build tsconfig's rootDir; lint them with a
      // config that includes them.
      files: ["tests/**/*.ts"],
      parserOptions: { project: path.join(__dirname, "tsconfig.test.json") },
    },
  ],
};
