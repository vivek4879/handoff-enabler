import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // We maintain our own root CLAUDE.md; don't let `next dev` regenerate
  // a second, conflicting AGENTS.md/CLAUDE.md pair inside apps/web.
  agentRules: false,
};

export default nextConfig;
