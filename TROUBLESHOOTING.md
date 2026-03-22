# Troubleshooting — Docker Local Setup

Issues encountered and fixes when running `make SUBMODULES_INIT=false` on WSL2/Ubuntu.

---

## 1. MongoDB 4.2 APT Signing Key Expired

**Error:**
```
W: GPG error: http://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.2 Release:
   The following signatures were invalid: EXPKEYSIG 4B7C549A058F8B6B
E: The repository 'http://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.2 Release' is not signed.
The command '/bin/sh -c apt-get -y update && apt-get -y install flip unzip' returned a non-zero code: 100
```

**Cause:** MongoDB's apt signing key for 4.2 has expired. The `mongo:4.2` base image still references it.

**Fix** in `docker/ev_mongo.Dockerfile`:
```dockerfile
RUN rm -f /etc/apt/sources.list.d/mongodb*.list \
  && apt-get -y update \
  && apt-get -y install flip unzip
```
Remove the MongoDB apt repo before updating — it's not needed since MongoDB is already installed in the base image.

---

## 2. Docker Network Conflict on `make`

**Error:**
```
ERROR: Network "evse_ev_network" needs to be recreated - option "com.docker.network.enable_ipv6" has changed
```

**Cause:** `docker-compose-mongo-express.yml` and `docker-compose-local-env.yml` both define `ev_network` with different options. Running `make` starts mongo-express first (which creates the network), then `local-env` tries to recreate it with different settings.

**Fix:**
1. Change `docker-compose-mongo-express.yml` and `docker-compose-server.yml` to use the network as external (joining instead of creating):
```yaml
networks:
  ev_network:
    external:
      name: evse_ev_network
```
2. Fix `Makefile` so `local-env` always runs before `mongo-express` (so it creates the network first):
```makefile
local-env:   # remove the mongo-express dependency
    docker-compose -p $(PROJECT_NAME) -f docker-compose-local-env.yml up -d

all: local-env mongo-express $(NAME)   # explicit order
```

**Clean start when hitting this error:**
```bash
make clean
docker network prune -f
make SUBMODULES_INIT=false
```

---

## 3. Private Submodules Fail to Clone

**Error:**
```
remote: Repository not found.
fatal: repository 'https://github.com/sap-labs-france/ev-sap-charging-station-templates.git/' not found
```

**Cause:** Three submodules (`ev-sap-charging-station-templates`, `ev-aws`, `ev-ci`) are private SAP repos not publicly accessible.

**Fix:** Always pass `SUBMODULES_INIT=false` to skip submodule cloning:
```bash
make SUBMODULES_INIT=false
```

---

## 4. Port 81 Forbidden on WSL2

**Error:**
```
Cannot start service server: ports are not available: exposing port TCP 0.0.0.0:81 -> 127.0.0.1:0:
listen tcp 0.0.0.0:81: bind: An attempt was made to access a socket in a way forbidden by its access permissions.
```

**Cause:** On Windows/WSL2, ports below 1024 require admin privileges.

**Fix** in `docker/docker-compose-server.yml` — map to a higher host port:
```yaml
ports:
  - 8081:81   # was 81:81
```
REST API is then accessible at **http://localhost:8081** instead of port 81.

---

## 5. Server Crashes on Startup — `TypeError: Cannot read properties of undefined (reading 'toString')`

**Error:**
```
3/22/2026, 3:03:58 PM - Connecting to the Database...
3/22/2026, 3:03:58 PM - TypeError: Cannot read properties of undefined (reading 'toString')
```

**Cause:** The JSON schema validator for `Storage` config (`configuration-save.json`) only allows `uri`, `poolSize`, `minPoolSize`, `maxPoolSize`, `debug`, and `readPreference`. Fields like `host`, `port`, `user`, `password`, `database`, and `replicaSet` are **not in the schema** and get stripped by the validator. This leaves `port` as `undefined` when the code calls `port.toString()`.

The default `docker/config.json` had `"uri": null` (fails the `string` type check) plus individual host/port fields that get stripped.

**Fix** in `docker/config.json` — replace individual fields with a proper MongoDB URI:
```json
"Storage": {
  "implementation": "mongodb",
  "uri": "mongodb://evse-user:evse-user-pwd@mongodb:27017/evse?replicaSet=rs0",
  "poolSize": 200,
  "debug": false
}
```

After any `docker/config.json` change, rebuild the server image (config is baked in at build time):
```bash
docker-compose -p evse -f docker-compose-server.yml build --no-cache
docker-compose -p evse -f docker-compose-server.yml up -d
```

---

## Expected Healthy Startup Log

When everything is working correctly you should see:
```
Connected to 'mongodb' successfully
Migration has been run successfully
Rest Server listening on 'http://...:81'
Soap Server listening on 'http://...:8000'
Json Server listening on 'http://...:8010'
Ocpi Server listening on 'http://...:9090'
OData Server listening on 'http://...:9292'
Rest, Soap, Json, Ocpi, OData server has been started successfully
```

The following warnings are **non-fatal** and expected in local dev:
- `Missing property 'Firebase'` — push notifications not configured
- `Missing property 'OICPService'` — OICP roaming not configured
- `Missing property 'Monitoring'` — metrics not configured
- `Missing property 'Cache'` — caching not configured
- `Missing property 'Shield'` — security shield not configured
