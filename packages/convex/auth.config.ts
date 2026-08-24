export default {
  providers: [
    {
      // URL del deployment de Convex (site). Se usa desde auth.config.ts para
      // identificar la aplicación ante los providers de autenticación.
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
