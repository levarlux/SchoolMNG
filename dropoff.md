Done! Code is ready. Here's your 3-step setup guide:
1. Vercel — Add levarlux.com
- Go to your Vercel project → Settings → Domains
- Add levarlux.com — Vercel automatically handles *.levarlux.com wildcards, no per-subdomain config needed.
- Vercel will give you a CNAME target (e.g. cname.vercel-dns.com).
2. Namecheap — Point DNS to Vercel
Option A (simplest): Change nameservers to Vercel's:
Namecheap Nameservers
dns1.registrar-servers.com
dns2.registrar-servers.com
Option B (CNAME): Keep Namecheap nameservers, add a CNAME record:
- Type: CNAME
- Host: @ (or * for wildcard)
- Target: cname.vercel-dns.com
3. Clerk Dashboard — Allow subdomains
- Go to Clerk Dashboard (https://dashboard.clerk.com) → your app → Sessions
- Authorized origins: Add https://*.levarlux.com
- Cookie domain: Set to .levarlux.com (so the session cookie works across all subdomains)
4. Vercel Environment Variables
Set these in Vercel → Settings → Environment Variables (production):
NEXT_PUBLIC_APP_URL=https://levarlux.com
Result: oakridge.levarlux.com just works — no DNS config per school, no manual subdomain additions. The admin page now shows the right domain dynamically.