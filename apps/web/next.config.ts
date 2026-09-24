import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * The content security policy.
 *
 * Everything the page loads comes from this origin: no fonts, scripts,
 * styles or images from anyone else (SPEC §2 rule 7). 'unsafe-inline' for
 * scripts is required by the App Router, which streams its payload through
 * inline script tags; without nonces (which would force every page to be
 * rendered per request) there is no narrower choice. 'unsafe-eval' is added
 * only in development, where React uses eval to rebuild call stacks; it is
 * never sent in production.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // same-origin, not no-referrer: browsers send `Origin: null` on native form
  // posts under no-referrer, and Next then refuses the server action, so every
  // form without JavaScript failed. Cross-origin requests still get nothing.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // The development badge sits over the phone tab bar; nothing is lost without it.
  devIndicators: false,
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  async rewrites() {
    // A profile's public address is /@handle; the route lives at /u/[handle].
    return [{ source: "/@:handle", destination: "/u/:handle" }];
  },
};

export default nextConfig;
