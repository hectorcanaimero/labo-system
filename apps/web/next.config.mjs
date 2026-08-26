/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@labo/ui", "@labo/lib", "@labo/pdf", "@labo/db"],
  async redirects() {
    return [
      {
        source: "/login",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
