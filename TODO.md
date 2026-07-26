# TODO: Run Indraam Landing Page Project with Full API Support

## Completed Steps
- [x] Read and understand all project files
- [x] Identified issue: Vercel CLI fails due to parentheses in folder name
- [x] Plan approved: Create custom Express dev server

## Steps
- [x] Install express dependency
- [x] Create `dev-server.js` that:
  - Loads `.env.local` environment variables
  - Serves static files (HTML, CSS, JS, assets)
  - Mounts all 6 API handlers: `/api/agent`, `/api/gaps`, `/api/contact`, `/api/admin/login`, `/api/admin/data`, `/api/admin/export`
  - Handles `/admin` → `/admin.html` rewrite
  - Runs on port 3000
- [x] Update `package.json` scripts to use `node dev-server.js`
- [ ] Test the server: static files and API endpoints
- [ ] Open browser to verify the landing page works
