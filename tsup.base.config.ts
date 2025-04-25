import { esbuildPluginFilePathExtensions } from "esbuild-plugin-file-path-extensions";
import type { Options } from "tsup";

export const BASE_CONFIG = {
  bundle: true, // required by `esbuild-plugin-file-path-extensions`, no actual bundling occurs
  entry: ["src/**"],
  sourcemap: true,
  target: "node20",
  esbuildPlugins: [esbuildPluginFilePathExtensions({})],
} as const satisfies Options;
