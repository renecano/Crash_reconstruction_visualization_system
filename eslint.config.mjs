// Configuración ESLint para packages/*. apps/web tiene la suya (eslint-config-next).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

// E8 (ADR 0029): funciones de Math cuya precisión depende del motor y `**` no entero.
const ENGINE_MATH = [
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
];
const DETERMINISM_RULES = {
  "no-restricted-properties": [
    "error",
    ...ENGINE_MATH.map((property) => ({
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
};
// Archivos del visor que alimentan el horneado con Rapier (E8 compara sus cuadros).
const VIEWER_BAKE_FILES = [
  "debris.ts",
  "debris-scene.ts",
  "rollover-scene.ts",
  "person-ragdoll.ts",
  "people-scene.ts",
  "person-pose.ts",
  "sample.ts",
  "damage.ts",
  "vehicle-geometry.ts",
  "loft.ts",
  "body-assets.ts",
  "coords.ts",
  "damage-rig.ts",
];

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
    rules: DETERMINISM_RULES,
  },
  {
    // E8: el horneado del visor con Rapier (restos, volcaduras y ragdolls) y lo que lo alimenta
    // tampoco usa trigonometría del motor, ni la de los ayudantes de three.js (van por `dthree`).
    files: VIEWER_BAKE_FILES.map((f) => `packages/viewer/src/${f}`),
    rules: {
      ...DETERMINISM_RULES,
      "no-restricted-syntax": [
        ...DETERMINISM_RULES["no-restricted-syntax"],
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(setFromAxisAngle|applyAxisAngle|slerp|slerpQuaternions|setFromEuler|angleTo)$/]",
          message:
            "Este ayudante de three.js usa Math.sin/cos/acos del motor; usa dthree (ADR 0029).",
        },
      ],
    },
  },
);
