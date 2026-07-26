/* ==========================================================================
   Local development server — serves static files + all API handlers.

   Purpose: Vercel CLI fails in folders with parentheses in their name, so
   this Express wrapper lets you run the full project locally with all serverless
   endpoints working.

   Usage: node dev-server.js
   ========================================================================== */

require('dotenv').config({ path: '.env.local', override: true });

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = Number(process.env.PORT || 3000);

/* --------------------------------------------------------------------------
   Middleware
   -------------------------------------------------------------------------- */

// Parse JSON bodies for API routes
app.use('/api', express.json({ limit: '100kb' }));

// CORS headers (same logic as guard.js for local dev)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Security headers (matching vercel.json)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (req.path.startsWith('/admin') || req.path.startsWith('/api/admin/')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

/* --------------------------------------------------------------------------
   Helper: wrap Vercel-style handlers for Express
   -------------------------------------------------------------------------- */

/** Each handler is a function(req, res) just like Express. */
function mountApi(routePath, handlerFile) {
  const handler = require(path.resolve(__dirname, handlerFile));
  // Match ALL HTTP methods — the handler inspects req.method internally
  app.all(routePath, (req, res) => {
    handler(req, res);
  });
}

/* --------------------------------------------------------------------------
   Mount all API endpoints
   -------------------------------------------------------------------------- */

mountApi('/api/agent', 'api/agent.js');
mountApi('/api/gaps', 'api/gaps.js');
mountApi('/api/contact', 'api/contact.js');

// Admin routes
mountApi('/api/admin/login', 'api/admin/login.js');
mountApi('/api/admin/data', 'api/admin/data.js');
mountApi('/api/admin/export', 'api/admin/export.js');

/* --------------------------------------------------------------------------
   Static file serving
   -------------------------------------------------------------------------- */

// Rewrite /admin → /admin.html
app.get('/admin', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'admin.html'));
});

// Serve everything else as static files
app.use(express.static(__dirname, {
  index: 'index.html',
  setHeaders: (res, filePath) => {
    // Cache HTML files briefly, assets longer
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    } else if (/\.(css|js|png|jpg|svg|ico|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

/* --------------------------------------------------------------------------
   Start
   -------------------------------------------------------------------------- */

app.listen(PORT, () => {
  console.log(`\n  ⚡ Indraam dev server running`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Admin:   http://localhost:${PORT}/admin`);
  console.log(`  API:     http://localhost:${PORT}/api/agent\n`);
});
