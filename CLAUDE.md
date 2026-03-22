# ev-server — Claude Project Instructions

## What This Project Is

**Open e-Mobility EV Server** — Node.js/TypeScript backend (v2.7.9) by SAP Labs France.

- Collects data from EV charging stations via **OCPP protocol** (SOAP + WebSocket)
- Stores everything in **MongoDB** (requires replica set `rs0`)
- Exposes a **REST API** consumed by the Angular `ev-dashboard` frontend

GitHub: https://github.com/sap-labs-france/ev-server
Dashboard repo: https://github.com/sap-labs-france/ev-dashboard

---

## Stack

- **Runtime:** Node.js 16.x, TypeScript 4.x
- **Database:** MongoDB 4.x (replica set required)
- **Build:** Webpack
- **Tests:** Jest
- **Config:** `src/assets/config.json` (copy from `config-template-http.json` or `config-template-https.json`)

---

## Architecture

Three services run in one process:

| Service | Protocol | Port | What connects to it |
|---------|----------|------|---------------------|
| Central Service Server — OCPP-S (SOAP) | HTTP | 8000 | Charging stations (SOAP protocol) |
| Central Service Server — OCPP-J (WebSocket) | WS | 8010 | Charging stations (WebSocket protocol) |
| Central Service REST Server | HTTP | 80 (Docker: 8081) | ev-dashboard (Angular frontend) |
| OCPI roaming service | HTTP | 9090 | External roaming partners (Gireve, Hubject) |
| OICP roaming service | HTTP | 9080 | External roaming partners (Hubject OICP) |
| OData service | HTTP | 9292 | SAP Analytics |

### Docker container ports

| Container | Port | What it is |
|-----------|------|------------|
| MongoDB | 27017 | Database |
| MailDev SMTP | 1025 | ev-server sends emails here (configure in `config.json`) |
| MailDev Web UI | 1080 | Open in browser to read captured emails → http://localhost:1080 |
| Mongo Express | 8091 | Open in browser to browse the DB → http://localhost:8091 |
| Swagger UI | 8081 | REST API docs → http://localhost:8081/v1/docs |

---

## How to Connect the EV Dashboard

1. Copy `src/assets/config-template-http.json` → `src/assets/config.json`
2. Configure `CentralSystemRestService` (the endpoint the dashboard calls):
   ```json
   "CentralSystemRestService": {
     "protocol": "http",
     "host": "localhost",
     "port": 80,
     "userTokenKey": "YourSecretKey",
     "captchaSecretKey": "YOUR_GOOGLE_RECAPTCHA_SERVER_KEY"
   }
   ```
3. Configure the frontend URL for email links:
   ```json
   "CentralSystemFrontEnd": {
     "protocol": "http",
     "host": "localhost",
     "port": 80
   }
   ```
4. Point the Angular `ev-dashboard` environment config to the same `host:port` as `CentralSystemRestService`
5. Set up MongoDB (see Database section below)

---

## Database Setup

MongoDB requires a replica set. Quick start:

```shell
mongod --auth --port 27017 --dbpath /var/lib/mongodb --replSet rs0
```

Activate replica set (first time only):
```shell
mongo
rs.initiate()
```

Create admin user on `admin` schema, app user on `evse` schema. See README.md for full SQL.

**Docker shortcut** (easiest local setup):
```bash
cd docker && make local-env
```
Add `ev_mongo 127.0.0.1` to `/etc/hosts`, then:
- MongoDB: `evse-admin` / `evse-admin-pwd`
- Master tenant: `super.admin@ev.com` / `Super.admin00`
- SLF tenant: `slf.admin@ev.com` / `Slf.admin00`

---

## Start Commands

```bash
npm run start:dev        # development (rebuild + restart on changes)
npm run start            # production
npm run start:dev:debug  # debug mode with inspector
```

Docker:
```bash
cd docker && make SUBMODULES_INIT=false        # start everything (recommended)
cd docker && make local-env                    # DB + mail + mongo-express only
cd docker && make server SUBMODULES_INIT=false # ev-server container only
```

> **Always use `SUBMODULES_INIT=false`** — the submodules (`ev-sap-charging-station-templates`, `ev-aws`, `ev-ci`) are private SAP repos that are not publicly accessible. Without this flag `make` will fail trying to clone them.

`make` (default `all`) starts **5 containers** in order:
1. **MongoDB** — the database
2. **enable-replset** — one-shot container that runs `rs.initiate()` to activate the replica set
3. **MailDev** — fake SMTP server, catches all outgoing emails (web UI port 1080)
4. **mongo-express** — MongoDB web UI (browser DB viewer)
5. **ev-server** — the Node.js backend itself

### WSL2 prerequisite — disable userland proxy

On WSL2, Docker's fallback `docker-proxy` has a bug where it assigns the wrong container IP, breaking port forwarding for some containers (e.g. mongo-express on 8091). Fix once per machine:

```bash
sudo nano /etc/docker/daemon.json
```
Set content to:
```json
{"userland-proxy": false}
```
Then: `sudo service docker restart`

This is a one-time setup. Pure Linux does not need this.

### Clean start / reset

```bash
cd docker && make clean
docker network rm evse_ev_network
docker network prune -f
make SUBMODULES_INIT=false
```

---

## Tests

```bash
npm run test:createContext   # run once to seed test DB
npm run test                 # run all tests
npm run test:ocpp            # OCPP-specific tests
npm run test:billing         # billing tests
```

Requires `test/config/local.json` (copy from `test/config-template.json`) with superadmin/admin credentials.

---

## Config File Location

`src/assets/config.json` — never committed, always local. Templates:
- `src/assets/config-template-http.json`
- `src/assets/config-template-https.json`
