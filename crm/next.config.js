const isDemoBuild = process.env.DEMO_BUILD === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
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
