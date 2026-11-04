import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silences Turbopack's root-inference warning: it walks up from this project and finds an
  // unrelated package-lock.json higher up the Windows user profile tree (outside any git repo
  // this project is part of) and second-guesses itself. Pinning the root to this project
  // directory is the fix Next.js's own warning suggests.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
