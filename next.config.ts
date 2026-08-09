import type { NextConfig } from 'next';

/**
 * Security headers applied to every response.
 * CSP is intentionally strict but compatible with Next.js' inline bootstrap script,
 * which requires 'unsafe-inline' for styles and a nonce-free script policy in dev.
 * Dev additionally needs 'unsafe-eval' for Turbopack's HMR runtime.
 */
const cspScriptSrc = process.env.NODE_ENV === 'development' ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${cspScriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['@node-rs/argon2', 'exceljs', 'nodemailer'],
  experimental: {
    // Vercel Functions cap request bodies at 4.5 MB. Public-site media is
    // limited to 4 MB, leaving room for the multipart Server Action envelope.
    serverActions: { bodySizeLimit: '4.25mb' },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
