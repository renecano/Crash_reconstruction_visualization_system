// Configuración ESLint para packages/*. apps/web tiene la suya (eslint-config-next).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.venv/**",
      "apps/web/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // E8 (ADR 0029): el solver da el mismo resultado en cualquier navegador. Las funciones de Math
    // cuya precisión depende del motor y `**` con exponente no literal van por `dmath`.
    files: ["packages/solver-ts/src/**/*.ts"],
    ignores: ["packages/solver-ts/src/**/*.test.ts", "packages/solver-ts/src/dmath.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        ...[
          "sin",
          "cos",
          "tan",
          "asin",
          "acos",
          "atan",
          "atan2",
          "sinh",
          "cosh",
          "tanh",
          "asinh",
          "acosh",
          "atanh",
          "exp",
          "expm1",
          "log",
          "log1p",
          "log2",
          "log10",
          "pow",
          "cbrt",
          "hypot",
        ].map((property) => ({
          object: "Math",
          property,
          message: "Usa dmath: su precisión depende del motor y rompe E8 (ADR 0029).",
        })),
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "BinaryExpression[operator='**'][right.type!='Literal']",
          message: "`**` con exponente no literal depende del motor; usa dmath (ADR 0029).",
        },
        {
          selector: "BinaryExpression[operator='**'][right.type='Literal'][right.raw=/[.eE]/]",
          message: "`**` con exponente no entero depende del motor; usa dmath (ADR 0029).",
        },
      ],
    },
  },
);
