import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next genera AGENTS.md y CLAUDE.md en cada build; el proyecto documenta sus
  // decisiones en README.md y no necesita esos archivos versionados.
  agentRules: false,
};

export default nextConfig;
