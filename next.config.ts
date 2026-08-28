import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  async redirects() {
    return [
      {
        source: "/administracion/reportes/:code/designer",
        destination: "/administracion/reportes/:code",
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
