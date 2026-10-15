// Stable discovery endpoint: the mobile app fetches this instead of hardcoding
// the backend URL, so a rotated cloudflared hostname only needs a web redeploy
// (this domain never changes) rather than a native app rebuild + resubmit.
export async function GET() {
  return Response.json({ api_base: process.env.NEXT_PUBLIC_API_BASE });
}
