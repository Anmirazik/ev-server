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

On WSL2, Docker's fallback `docker-proxy` has a bug where it assigns the wrong container IP, breaking **both** host port forwarding and container-to-container networking on bridge networks. Symptoms:
- `evse_enablereplset_1` exits with code 1 — times out trying to reach `ev_mongo:27017`
- Replica set never initializes → ev-server gets `MongoServerSelectionError` on startup

Fix once per machine:

```bash
echo '{"userland-proxy": false}' | sudo tee /etc/docker/daemon.json
sudo service docker restart
```

Then do a full clean restart (see below). This is a one-time setup — pure Linux does not need this.

### Clean start / reset

```bash
cd docker && make clean
make clean-mongo-data          # wipe DB volume so init scripts re-run on next start
docker network rm evse_ev_network 2>/dev/null || true
docker network prune -f
make SUBMODULES_INIT=false
```

> **`make clean-mongo-data` is required** after any broken first-start. MongoDB's `docker-entrypoint-initdb.d/` scripts only run on an empty data volume. If the volume exists from a failed previous run, the init scripts are skipped and users/seed data will be missing.

### Known Docker init bugs (already fixed in this repo)

These bugs existed in the original upstream code and have been patched:

| File | Bug | Fix applied |
|---|---|---|
| `docker/initdb/createMongoUsers.sh` | Used `docker exec` inside the container — Docker CLI doesn't exist in the mongo image | Replaced with direct `mongo` call |
| `docker/initdb/createMongoUsers.sh` | Duplicated user creation already done by `000_createMongoUsers.js` — crashed with "user already exists" on every run | Added `db.getUser()` and `findOne()` guards to skip if already exists |
| `docker/ev_mongo.Dockerfile` | Used `flip -u` to convert line endings — fails with "binary file" on any non-ASCII or encoding-sensitive file | Replaced with `sed -i 's/\r$//'` which is equivalent but never rejects files |

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

---

## Cross-Repo Connection: ev-server ↔ ev-dashboard

The ev-dashboard Angular frontend talks **only** to ev-server's REST API. There is no WebSocket connection from the dashboard — it polls HTTP every 10 seconds (`pollIntervalSecs` in dashboard config).

### Config Alignment (must match on both sides)

| ev-server `config.json` key | ev-dashboard `config.json` key | Purpose |
|-----------------------------|-------------------------------|---------|
| `CentralSystemRestService.protocol` | `CentralSystemServer.protocol` | http or https |
| `CentralSystemRestService.host` | `CentralSystemServer.host` | Backend hostname |
| `CentralSystemRestService.port` | `CentralSystemServer.port` | Backend port (Docker: 8081) |
| `CentralSystemFrontEnd.protocol/host/port` | (dashboard's own URL) | Used by ev-server in email links that point back to the dashboard |
| `CentralSystemRestService.userTokenKey` | (secret — not in dashboard) | JWT signing secret (dashboard only decodes, never signs) |
| `CentralSystemRestService.captchaSecretKey` | `User.captchaSiteKey` | reCAPTCHA — server key and site key are a pair from Google |

### JWT Token Contract

ev-server signs the token; ev-dashboard decodes it. If you add/rename/remove claims, update both sides.

**Current claims** (`src/server/rest/v1/service/AuthService.ts` → `src/app/services/central-server.service.ts`):
- `tenantID` — Tenant identifier
- `userID` — User ID
- `role` — Single char: `S` (SuperAdmin), `A` (Admin), `B` (Basic), `D` (Demo)
- `currency` — ISO currency code
- `language` — Language code
- `locale` — Locale string

**If you change JWT claims on ev-server:**
→ Update `currentUser` references in `ev-dashboard/src/app/services/central-server.service.ts`
→ Update `UserToken` interface in `ev-dashboard/src/app/types/User.ts`
→ Update `AuthorizationService` in ev-dashboard if role values change

### API Endpoint Contract

All REST routes are defined in ev-server and consumed by name in ev-dashboard.

| ev-server file | ev-dashboard file | What it defines |
|---|---|---|
| `src/server/rest/v1/router/api/*.ts` | `src/app/types/Server.ts` (RESTServerRoute enum) | URL paths for every endpoint |
| `src/server/rest/v1/service/*.ts` | `src/app/services/central-server.service.ts` | Request/response handling |
| `src/types/*.ts` | `src/app/types/*.ts` | Shared data models |

**If you add a new endpoint on ev-server:**
1. Add route in the appropriate `src/server/rest/v1/router/api/` file
2. Add handler in `src/server/rest/v1/service/` with RBAC checks
3. → Add the route constant to `ev-dashboard/src/app/types/Server.ts` (`RESTServerRoute` enum)
4. → Add the method to `ev-dashboard/src/app/services/central-server.service.ts`

**If you rename or remove an endpoint on ev-server:**
1. → Update/remove the matching entry in `ev-dashboard/src/app/types/Server.ts`
2. → Update/remove the matching method in `ev-dashboard/src/app/services/central-server.service.ts`
3. → Search ev-dashboard for all callers of that method

### Data Model Sync

TypeScript types are **duplicated** between the two repos (no shared package). They must be kept in sync manually.

| ev-server `src/types/` | ev-dashboard `src/app/types/` |
|---|---|
| `ChargingStation.ts` | `ChargingStation.ts` |
| `Transaction.ts` | `Transaction.ts` |
| `User.ts` | `User.ts` |
| `Tag.ts` | `Tag.ts` |
| `Asset.ts` | `Asset.ts` |
| `Billing.ts` | `Billing.ts` |
| `Car.ts` | `Car.ts` |
| `Authorization.ts` | `Authorization.ts` |

**If you add/rename/remove a field on a model in ev-server:**
→ Apply the same change to the matching file in `ev-dashboard/src/app/types/`
→ Search ev-dashboard for all usages of the old field name

### Authorization Roles

ev-server defines roles as single chars; ev-dashboard maps them to display names.

| ev-server role char | ev-dashboard constant | Access level |
|---|---|---|
| `S` | `SUPER_ADMIN` | Full system + tenant management |
| `A` | `ADMIN` | Tenant admin |
| `B` | `BASIC` | Standard user |
| `D` | `DEMO` | Demo user (read-only) |

**If you add a new role on ev-server:**
→ Add the char in `src/types/User.ts` (`UserRole` enum) on ev-server
→ Add the constant in `ev-dashboard/src/app/types/User.ts`
→ Update `AuthorizationService` in ev-dashboard to handle the new role
→ Update RBAC rules in ev-server `src/authorization/Authorizations.ts`

### Response Envelope Format

ev-server REST responses follow a consistent envelope. ev-dashboard assumes this shape everywhere.

```typescript
// List responses
{ count: number, result: T[] }

// Single-item / action responses
{ id?: string, status?: string, ...fields }
```

Changing this envelope shape will break ev-dashboard's table/pagination components.

### HTTP Headers

ev-dashboard sends these headers on every authenticated request:
- `Authorization: Bearer <jwt>` — checked by Passport JWT strategy in ev-server
- `Content-Type: application/json`
- `Tenant: <tenantID>` — used for multi-tenant routing in ev-server

**If ev-server starts requiring a new header**, add it in `central-server.service.ts` → `buildHttpHeaders()`.

### CORS

ev-server enables CORS globally via `cors()` in `ExpressUtils.ts` (currently allows all origins). If you restrict CORS origins, add the dashboard's URL to the allowed list.

### What to check when making changes

| You change this in ev-server | Check in ev-dashboard |
|---|---|
| Add/rename/remove REST endpoint | `src/app/types/Server.ts` + `central-server.service.ts` |
| Change JWT claims | `src/app/types/User.ts` (UserToken) + `central-server.service.ts` (loginSucceeded) |
| Add/rename field on a shared model | Matching file in `src/app/types/` |
| Change user role values | `src/app/types/User.ts` + `authorization.service.ts` |
| Change REST port/host in config | `CentralSystemServer` in ev-dashboard `config.json` |
| Change `CentralSystemFrontEnd` | Dashboard's own base URL (affects email links) |
| Change reCAPTCHA server key | `User.captchaSiteKey` (site key) must be from the same Google reCAPTCHA pair |
| Change response envelope shape | Table/data-source components in `src/app/shared/table/` |
