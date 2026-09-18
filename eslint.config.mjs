import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Vendored ReactBits components (added via the shadcn registry). Their motion
    // logic is upstream code we do not rewrite; relax the rules that only affect style.
    files: ["src/components/reactbits/**"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/immutability": "off",
      // These components read a ref's `.current` during render by design
      // (an imperative, no-re-render animation loop writes to the DOM
      // directly and reads its own last-written values back) - upstream
      // architecture, not something we rewrite here.
      "react-hooks/refs": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
