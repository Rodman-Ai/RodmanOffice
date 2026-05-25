const path = require("path");

const isDemoBuild = process.env.DEMO_BUILD === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  // Make the shared spreadsheet engine (repo-root /lib/sheets/) importable
  // from CRM client + server code as `@rodman/sheets`. It's plain ESM JS
  // with JSDoc — Next.js's webpack handles it as-is, we just need the alias.
  webpack: (config) => {
    config.resolve.alias["@rodman/sheets"] = path.resolve(
      __dirname,
      "../lib/sheets/index.js",
    );
    return config;
  },
  ...(isDemoBuild
    ? {
        output: "export",
        images: { unoptimized: true },
        basePath,
        assetPrefix: basePath || undefined,
        trailingSlash: true,
      }
    : {
        async headers() {
          return [
            {
              source: "/manifest.webmanifest",
              headers: [
                {
                  key: "Content-Type",
                  value: "application/manifest+json",
                },
              ],
            },
          ];
        },
      }),
};

module.exports = nextConfig;
