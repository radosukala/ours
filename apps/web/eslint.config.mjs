import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "drizzle/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // SPEC §2 and M-0010: the core has no framework imports, so iOS and
    // Android can sit on the same core later. This rule makes that CHECKED
    // by lint rather than only DECLARED.
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "@/web/*",
                "@/app/*",
                "@/components/*",
                "../web/*",
                "../app/*",
                "../components/*",
              ],
              message:
                "src/core must not import a framework or the web layer (SPEC §4).",
            },
          ],
        },
      ],
    },
  },
];

export default config;
