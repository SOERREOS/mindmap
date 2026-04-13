import type { NextConfig } from "next";

const securityHeaders = [
  // 클릭재킹 방지
  { key: 'X-Frame-Options', value: 'DENY' },
  // MIME 스니핑 방지
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Referrer 정보 최소화
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // XSS 필터 (레거시 브라우저용)
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  // 불필요한 브라우저 기능 비활성화
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  // HSTS: HTTPS 강제 (1년, subdomains 포함)
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  // CSP: 허용된 소스만 로드
  // - Gemini API 호출 허용 (NEXT_PUBLIC_GEMINI_API_KEY 사용)
  // - Google Fonts 허용
  // - Upstash Redis는 서버 사이드에서만 사용하므로 connect-src 불필요
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js 번들 필요
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://generativelanguage.googleapis.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
