# Deploying DFX Wholesale on the DFX VPS

Server `200.97.161.119` (dfxgold), user **sufiyan**, rootless Docker. Address: **https://wholesale.dfxgold.tech**.

## How it is kept apart from DFX

| | DFX (production) | Wholesale |
|---|---|---|
| Docker | system Docker (root) | rootless Docker under `sufiyan` |
| Data | DFX volumes | `/home/sufiyan/.local/share/docker` |
| Database | DFX Postgres | its own Postgres container, not published |
| Ports | 127.0.0.1:8000 / 3000 | 127.0.0.1:**8020** / **3020** |
| nginx | `dfx.conf` | its own file, names prefixed `wholesale_` |
| Limits | — | db 512 MB / 0.75 CPU, api 640 MB / 1 CPU, web 384 MB / 0.5 CPU |

Nothing here edits DFX containers, databases or nginx files. The only shared piece is nginx,
where the lead adds one new site file after reviewing it.

Already done: rootless Docker installed (`docker context` = `rootless`), `loginctl enable-linger sufiyan`.

---

## 1. Read-only checks (nothing changes)

```bash
ssh dfx-vps
docker context show                       # rootless
ss -ltn | grep -E ':(8020|3020)\b'        # no output = ports free
free -h; df -h ~; nproc                   # room to spare?
```

If 8020 or 3020 is taken, pick other ports and put them in `.env` (API_PORT / WEB_PORT) and in the nginx file.

## 2. Get the code (read-only deploy key)

The GitHub repo is private, so the server gets its own **read-only** key for this one repo.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/wholeseller_deploy -N "" -C "dfxgold wholesale deploy"
cat ~/.ssh/wholeseller_deploy.pub
```

GitHub → `Mohammed-Sufiyan/wholeseller` → Settings → Deploy keys → Add → paste it, **leave "Allow write access" off**.

```bash
cat >> ~/.ssh/config <<'EOF'
Host github-wholeseller
    HostName github.com
    User git
    IdentityFile ~/.ssh/wholeseller_deploy
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
git clone git@github-wholeseller:Mohammed-Sufiyan/wholeseller.git ~/projects/wholesale
```

## 3. Secrets

```bash
cd ~/projects/wholesale/deploy
cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
sed -i "s/^SECRET_KEY=.*/SECRET_KEY=$(openssl rand -hex 32)/" .env
chmod 600 .env
```

`.env` stays on the server only (it is in `.gitignore`). Losing it locks you out of the database, so keep a copy somewhere safe.

## 4. Build and start

The first build takes a few minutes and uses most of the CPU while it runs. **Do it at a quiet time**
for the DFX apps.

```bash
cd ~/projects/wholesale/deploy
docker compose up -d --build
docker compose ps                         # db healthy, api healthy, web up
curl -s http://127.0.0.1:8020/api/v1/health
curl -sI http://127.0.0.1:3020 | head -1  # HTTP/1.1 200
docker stats --no-stream                  # memory stays under the limits
```

Migrations run automatically when the API starts. Logs: `docker compose logs -f api`.

## 5. Create the owner — before the site is public

The first account becomes the owner. Create it from the server, while only the server can reach the app:

```bash
read -rp "Owner username (small letters): " U; read -rp "Owner full name: " N; read -rsp "Owner password (8+ chars): " P; echo
curl -s -X POST http://127.0.0.1:8020/api/v1/auth/setup -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U\",\"full_name\":\"$N\",\"password\":\"$P\"}" | head -c 120; echo
unset P
```

A reply starting `{"access_token"` means done. **Do not run the demo seed script on this server.**

## 6. nginx + SSL (the lead, after reviewing the file)

When `wholesale.dfxgold.tech` resolves to 200.97.161.119 (`dig +short wholesale.dfxgold.tech`):

```bash
sudo cp ~/projects/wholesale/deploy/nginx/wholesale.dfxgold.tech.conf /etc/nginx/sites-available/wholesale.dfxgold.tech
sudo ln -s /etc/nginx/sites-available/wholesale.dfxgold.tech /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d wholesale.dfxgold.tech
```

`nginx -t` must say OK before the reload; if it doesn't, nothing changes for the DFX sites.

## 7. Nightly backups (user timer, no root)

```bash
chmod +x ~/projects/wholesale/deploy/backup.sh
mkdir -p ~/.config/systemd/user
cp ~/projects/wholesale/deploy/systemd/wholesale-backup.* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now wholesale-backup.timer
systemctl --user list-timers wholesale-backup.timer
~/projects/wholesale/deploy/backup.sh       # one backup now, to check it works
```

Backups land in `~/projects/wholesale/deploy/backups/` (14 days kept). Copy them off the server now and then.

## 8. Updating to a new version

```bash
cd ~/projects/wholesale
./deploy/backup.sh                          # backup first, always
git pull
cd deploy && docker compose up -d --build   # rebuilds what changed; migrations run on start
docker compose ps
```

Going back: `git checkout <previous commit>` and `docker compose up -d --build`. Migrations only add
tables and columns, so an older version still runs against a newer database.

## 9. Restoring a backup

```bash
cd ~/projects/wholesale/deploy
gunzip -c backups/db_YYYY-MM-DD_HHMM.sql.gz | docker compose exec -T db psql -U wholesale -d wholesale
docker compose exec -T api tar -C /data -xzf - < backups/uploads_YYYY-MM-DD_HHMM.tar.gz
docker compose restart api
```

## Everyday commands

```bash
docker compose ps                 # what's running
docker compose logs -f --tail 100 api
docker compose restart api        # or web / db
docker stats --no-stream          # memory and CPU
docker compose down               # stop (data stays in the volumes)
```

Never `docker compose down -v`: `-v` deletes the database and photos.
