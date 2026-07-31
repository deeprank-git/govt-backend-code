# Deployment — Hostinger VPS (Backend)

No Docker. Pull the repo onto the VPS, install dependencies, run under PM2, front it with Nginx.

**VPS state:** Ubuntu, Nginx, Node, PM2, and Certbot already installed. IP `89.116.20.193`.

Replace `api.testopy.com` and `5000` everywhere below with the actual subdomain and port for this project.

---

## 1. DNS

Add an A record for the API subdomain:

| Type | Name  | Value            |
|------|-------|------------------|
| A    | api   | `89.116.20.193`  |

Propagation takes a few minutes to a few hours.

---

## 2. Set allowed CORS origins in `.env`

CORS origins are read from `ALLOWED_ORIGINS` in `.env` (comma-separated, no spaces). Set this in step 4 when you create the `.env` file on the VPS — no code changes needed.

---

## 3. Clone the repo

```bash
git clone <your-repo-url> ~/govt-backend
cd ~/govt-backend
```

On subsequent deployments just pull:

```bash
cd ~/govt-backend
git pull
```

---

## 4. Create `.env` with production values

`.env` is gitignored, so it must be created manually on the VPS:

```bash
cat > ~/govt-backend/.env <<'EOF'
mongoDB_URL=mongodb+srv://<user>:<password>@<cluster>/<dbname>
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d
PORT=5000
HOST=0.0.0.0
ALLOWED_ORIGINS=https://testopy.com,https://www.testopy.com
EOF
```

---

## 5. Install dependencies

No build step — the server runs directly from source:

```bash
cd ~/govt-backend
npm install --omit=dev
```

---

## 6. Create the PM2 ecosystem file

`package.json` has `"type": "module"`, so the ecosystem file must use the `.cjs` extension so PM2 treats it as CommonJS:

```bash
cat > ~/govt-backend/ecosystem.config.cjs <<'EOF'
module.exports = {
  apps: [
    {
      name: "govt-backend",
      script: "index.js",
      interpreter: "node",
      cwd: "/root/govt-backend",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
EOF
```

---

## 7. Start with PM2

```bash
cd ~/govt-backend
pm2 start ecosystem.config.cjs
pm2 save
```

Enable PM2 auto-start on reboot (run once per VPS):

```bash
pm2 startup
# execute the command it prints, then:
pm2 save
```

Verify the API is running:

```bash
curl http://localhost:5000/api/health
# expect: {"success":true,"message":"GovtPrep API is running"}
```

---

## 8. Nginx site config

### Backend (api.testopy.com → port 5006)

```bash
sudo tee /etc/nginx/sites-available/api.testopy.com > /dev/null <<'EOF'
server {
    listen 80;
    server_name api.testopy.com;

    # Increase body size limit for file uploads (matches Multer's 20 MB limit)
    client_max_body_size 25M;

    location / {
        proxy_pass http://localhost:5006;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/api.testopy.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

At this point `http://api.testopy.com/api/health` should respond (once DNS has propagated).

### Frontend (testopy.com → port 5005)

```bash
sudo tee /etc/nginx/sites-available/testopy.com > /dev/null <<'EOF'
server {
    listen 80;
    server_name testopy.com www.testopy.com;

    location / {
        proxy_pass http://localhost:5005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/testopy.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 9. SSL via Let's Encrypt

```bash
sudo certbot --nginx -d api.testopy.com
```

Certbot rewrites the site file to add the `listen 443 ssl` block and an HTTP → HTTPS redirect, and sets up auto-renewal via a systemd timer (`sudo systemctl status certbot.timer` to confirm).

After getting SSL, update `VITE_API_BASE_URL` in the frontend `.env` on the VPS from `http://89.116.20.193:5000/api` to `https://api.testopy.com/api`, then rebuild and restart the frontend.

---

## Redeploying after changes

```bash
cd ~/govt-backend
git pull
npm install --omit=dev
pm2 restart govt-backend
```

---

## Notes

- **No build step**: unlike the frontend, this is a plain Node.js ESM app — `npm install` and PM2 are all that's needed.
- **`uploads/` directory**: uploaded files are written to `./uploads` relative to the project root. This directory is gitignored. On first deploy it is created automatically. Its contents persist across `git pull` deployments because they are never in the repo. If you wipe and re-clone, copy the directory back manually from a backup.
- **CORS origins**: read from `ALLOWED_ORIGINS` in `.env` as a comma-separated list. To add a new origin, update `.env` on the VPS and run `pm2 restart govt-backend` — no code change needed.
- **`.cjs` ecosystem file**: required because `package.json` sets `"type": "module"` — a `.js` file would be treated as ESM and break PM2's require-based loader.
- **MongoDB Atlas**: the server connects to Atlas on startup; if the Atlas IP allowlist is restricted, add `89.116.20.193` to it.
- **Cron job**: `startAutoSubmitJob()` starts automatically when the server boots — no extra setup needed.
