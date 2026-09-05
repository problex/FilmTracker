# Deploying to the Synology NAS

The app runs on the Synology NAS at `192.168.0.9` via Docker Compose
(Container Manager), cloned from this GitHub repo at
`/volume1/docker/filmtracker`.

- Web: http://192.168.0.9:5173
- API: http://192.168.0.9:4000
- Postgres (host access, optional): `192.168.0.9:5433`

## One-time setup (already done)

- SSH user `problex` has a NOPASSWD sudoers rule scoped to the Container
  Manager docker binaries, in `/etc/sudoers.d/problex-docker`:
  ```
  problex ALL=(ALL) NOPASSWD: /volume1/@appstore/ContainerManager/usr/bin/docker, /volume1/@appstore/ContainerManager/usr/bin/docker-compose
  ```
- `/volume1/docker/filmtracker` is a git clone of this repo (`origin` =
  `https://github.com/problex/FilmTracker.git`), plus a `.env` (gitignored,
  never committed) holding `POSTGRES_PASSWORD` and `POSTGRES_HOST_PORT=5433`
  (host port 5432 is already taken by something else on the NAS).

## Deploying a new version

Push your changes to GitHub first (`git push origin main`), then:

```bash
ssh problex@192.168.0.9
cd /volume1/docker/filmtracker
git pull origin main

DOCKER=/volume1/@appstore/ContainerManager/usr/bin/docker
sudo -n $DOCKER compose up -d --build
```

`--build` rebuilds the `server`/`web` images only if their sources changed
(Docker layer caching keeps this fast). The `server` container reruns
migrations and the (idempotent) seed script on every start — existing price
history is untouched.

**`compose up` returning does not mean the API is ready.** The container runs
`db:migrate` and `db:seed` before `npm run start`, so port 4000 refuses
connections for ~10–15s after the container reports as up. Hitting it too early
gives `curl: (56) Recv failure: Connection reset by peer`, which looks like a
crash but isn't. Wait for readiness first:

```bash
until curl -sf http://192.168.0.9:4000/api/films >/dev/null; do sleep 2; done
```

## Useful commands (run on the NAS, with `DOCKER` set as above)

```bash
# Logs
sudo -n $DOCKER logs filmtracker-server-1 --tail 50 -f

# Status
sudo -n $DOCKER ps --filter name=filmtracker

# Trigger an on-demand scrape
curl -X POST http://192.168.0.9:4000/api/admin/scrape

# Restart without rebuilding
sudo -n $DOCKER compose restart

# Full stop
sudo -n $DOCKER compose down
```

## Notes

- The db, server, and web ports (5433/4000/5173) are only reachable on the
  LAN, not the internet.
- Postgres data lives in the named volume `filmtracker_filmtracker_pg` —
  `docker compose down` does not delete it, but `docker compose down -v`
  would. Never run that on the NAS without a backup.
- If a future host port ever conflicts, override it in the NAS's `.env`
  (see `.env.example` for the available `POSTGRES_HOST_PORT` variable).
