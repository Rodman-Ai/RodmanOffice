export { default } from "next-auth/middleware";

// Authenticate page navigations only. API routes return JSON 401s themselves
// via withAuth(). Public form pages and their public APIs (/f/*,
// /api/forms/public, /api/forms/submit) are intentionally unauthenticated so
// prospects can submit; those endpoints use owner credentials from env vars.
export const config = {
  matcher: [
    "/((?!login|f/|m/|api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)",
  ],
};
