module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
  },

  parser: "@typescript-eslint/parser",

  parserOptions: {
    project: ["./tsconfig.json"],
    tsconfigRootDir: __dirname,
    sourceType: "module",
  },

  plugins: ["@typescript-eslint"],

  ignorePatterns: [
    "lib/**",          // compiled JS
    ".eslintrc.js",    // config file itself
  ],

  rules: {
    // 🔕 Disable noisy style rules (backend glue code)
    "comma-spacing": "off",
    "comma-dangle": "off",
    "object-curly-spacing": "off",
    "max-len": "off",
    "quotes": "off",
    "eol-last": "off",
    "indent": "off",
    "valid-jsdoc": "off",
    "require-jsdoc": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
  },
};