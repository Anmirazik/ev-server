#!/bin/bash

# General configuration
MONGODB_PORT=27017
MONGO_CLIENT="mongo"

echo "Using $MONGO_CLIENT command, please make sure to use mongosh --quiet for mongodb version > 4.x"

# Admin DB user — skip if already created by 000_createMongoUsers.js
DB="admin"
USER="evse-admin"
PASSWORD="evse-admin-pwd"

$MONGO_CLIENT --port $MONGODB_PORT --eval "
var db = db.getSiblingDB(\"$DB\");
if (!db.getUser(\"$USER\")) {
    db.createUser({
        user: \"$USER\",
        pwd: \"$PASSWORD\",
        roles: [
            { role: \"read\",                   db: \"$DB\" },
            { role: \"readWrite\",              db: \"$DB\" },
            { role: \"dbAdmin\",               db: \"$DB\" },
            { role: \"userAdmin\",             db: \"$DB\" },
            { role: \"clusterAdmin\",          db: \"$DB\" },
            { role: \"readAnyDatabase\",       db: \"$DB\" },
            { role: \"readWriteAnyDatabase\",  db: \"$DB\" },
            { role: \"userAdminAnyDatabase\",  db: \"$DB\" },
            { role: \"dbAdminAnyDatabase\",    db: \"$DB\" }
        ]
    });
    print(\"Created user $USER\");
} else {
    print(\"User $USER already exists, skipping\");
}"

if [ $? -ne 0 ]; then
    echo "Error at creating admin user"
    exit 1
fi

# Evse DB user — skip if already created by 000_createMongoUsers.js
DB="evse"
USER="evse-user"
PASSWORD="evse-user-pwd"

$MONGO_CLIENT --port $MONGODB_PORT --eval "
var db = db.getSiblingDB(\"$DB\");
if (!db.getUser(\"$USER\")) {
    db.createUser({
        user: \"$USER\",
        pwd: \"$PASSWORD\",
        roles: [ { role: \"readWrite\", db: \"$DB\" } ]
    });
    print(\"Created user $USER\");
} else {
    print(\"User $USER already exists, skipping\");
}"

if [ $? -ne 0 ]; then
    echo "Error at creating evse user"
    exit 1
fi

# Insert super admin app user — skip if already inserted by 002_createSuperAdmin.js
DB="evse"

$MONGO_CLIENT --port $MONGODB_PORT --eval "
var db = db.getSiblingDB(\"$DB\");
if (db.getCollection(\"default.users\").findOne({ email: \"super.admin@ev.com\" }) === null) {
    db.getCollection(\"default.users\").insert({
      _id: ObjectId(),
      email: \"super.admin@ev.com\",
      address: {
        address1: null, address2: null, postalCode: null, city: null,
        department: null, region: null, country: null, coordinates: [0, 0]
      },
      costCenter: null, createdBy: null,
      createdOn: ISODate(\"2020-04-02T00:00:00.000+0000\"),
      deleted: false, firstName: \"Super\", iNumber: null, issuer: true,
      lastChangedBy: null, locale: \"en_US\", mobile: null, name: \"ADMIN\",
      notifications: {
        sendSessionStarted: true, sendOptimalChargeReached: true,
        sendEndOfCharge: true, sendEndOfSession: true,
        sendUserAccountStatusChanged: true, sendSessionNotStarted: true,
        sendCarSynchronizationFailed: true, sendUserAccountInactivity: true,
        sendPreparingSessionNotStarted: false, sendBillingSynchronizationFailed: false,
        sendNewRegisteredUser: false, sendUnknownUserBadged: false,
        sendChargingStationStatusError: false, sendChargingStationRegistered: false,
        sendOcpiPatchStatusError: false, sendOicpPatchStatusError: false,
        sendOfflineChargingStations: false
      },
      phone: null,
      password: \"\$2a\$10\$/c.TRisu3xPAGkgTL69b7uC4SGXqDIzFJuZgHOB1D.fvXf5h3WWwW\",
      passwordBlockedUntil: null, passwordResetHash: null,
      passwordWrongNbrTrials: NumberInt(0),
      eulaAcceptedHash: \"c308ac57857ce483ef1bb50fe8c1bc2bc3b5fcf067114c8b4a3a7abf9896c45f\",
      eulaAcceptedOn: ISODate(\"2020-04-02T00:00:00.000+0000\"),
      eulaAcceptedVersion: 28, role: \"S\", status: \"A\", notificationsActive: true
    });
    print(\"Inserted super admin user\");
} else {
    print(\"Super admin already exists, skipping\");
}"

if [ $? -ne 0 ]; then
    echo "Error inserting super admin"
    exit 1
fi
