import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const nextConfig: NextConfig = {
  // This app is a sibling project, not a workspace member. Without an explicit
  // root, Turbopack walks up and picks the repo (or the home directory) as the
  // workspace root because of the other lockfiles it finds there.
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
