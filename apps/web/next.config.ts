import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const withVarlock = varlockNextConfigPlugin();

import type { NextConfig } from "next";

import { withPwa } from "./pwa.config";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  typedRoutes: true,
};

export default withVarlock(withPwa(nextConfig));
