import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        // The old all-in-one configuration page (#41A): answered with a real
        // 308 before rendering. `nuevo` is the creation wizard, not a code.
        source: "/administracion/reportes/:code((?!nuevo$)[^/]+)",
        destination: "/administracion/reportes/:code/configurar",
        permanent: true,
      },
      {
        source: "/administracion/reportes/:code/designer",
        destination: "/administracion/reportes/:code/configurar",
        permanent: true,
      },
      {
        source: "/donaldson/reports/price-list-comparison/view",
        destination: "/donaldson/reports/PRICE_LIST_COMPARISON",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
