import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@hericilla/ui",
    "@hericilla/types",
    "@hericilla/supabase-clients",
    "@hericilla/push-web",
  ],
};

export default config;
