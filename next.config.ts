import type { NextConfig } from 'next';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH !== undefined
  ? process.env.NEXT_PUBLIC_BASE_PATH
  : '/us/ccdf-calculator';


const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // react-simple-maps and recharts ship CJS interop and rely on browser
  // globals; transpiling them avoids ESM/CJS mismatch errors in the build.
  transpilePackages: ['react-simple-maps', 'recharts'],
  turbopack: {
    root: process.cwd(),
  },
  // Next 16 writes AGENTS.md/CLAUDE.md into the repo root on every build.
  agentRules: false,
};

export default nextConfig;
