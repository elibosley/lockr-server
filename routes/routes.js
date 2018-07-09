const sqlite3 = require('sqlite3').verbose();
var admin = require("firebase-admin")

let db = new sqlite3.Database('./db/lockstatus.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the lockstatus database.');

    db.run('CREATE TABLE IF NOT EXISTS locks(id int(6), lock_status varchar(25), PRIMARY KEY (id))');
});

const serviceAccount = require('../firebase_credentials.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://doorlock-ffb4d.firebaseio.com'
});
var firestore = admin.firestore();
setupFirestoreWatcher("1");

function setupFirestoreWatcher(id) {
    var doc = firestore.collection('locks').doc(id);
    var observer = doc.onSnapshot(docSnapshot => {
        console.log(`Received doc snapshot: ${docSnapshot.data().lock_status}`);
        // This variable changed, update the lock status to the new value
        let sql = `SELECT "lock_status" from locks where id=${id}`
        db.get(sql, (err, row) => {
            if (err) {
                console.log("FAILED")
                console.error(err.message);
            } if (row.lock_status != docSnapshot.data().lock_status) {
                db.run(`DELETE from locks where id=${id}`);
                let sql = `insert into locks (id, lock_status) values (${id}, "${docSnapshot.data().lock_status}")`;
                db.run(sql, function (err) {
                    if (err) {
                        console.error(err.message);
                    }
                    console.log("Completed: changed to " + docSnapshot.data().lock_status);
                });
            }

        });
    }, err => {
        console.log(`Encountered error: ${err}`);
    });
}

var appRouter = function (app) {
    app.get("/", function (req, res) {
        res.status(200).send("Welcome to the Door Lock LocalServer");
    });
    app.get("/lockstatus/:id", function (req, res) {
        let sql = `SELECT lock_status from locks where id=${req.params.id}`

        db.get(sql, (err, row) => {
            if (err) {
                return console.error(err.message);
            }
            return row ? res.status(200).send(row.lock_status)
                : res.status(404).send("No status found")

        });
    });
    app.get("/lockstatus/:id/:lockstatus", function (req, res) {
        if (req.params.lockstatus === "locked" || req.params.lockstatus === "unlocked") {
            //delete old stuff
            db.run(`DELETE from locks where id=${req.params.id}`);
            firestore.collection('locks').doc(req.params.id).set({
                lock_status: req.params.lockstatus
            }, { merge: true });
            let sql = `insert into locks (id, lock_status) values (${req.params.id}, "${req.params.lockstatus}")`;
            db.run(sql, function (err) {
                if (err) {
                    return console.error(err.message);
                }
                res.status(200).send(req.params.lockstatus);
            });
        } else {
            res.status(200).send("Broken Parameter" + req.params.lockstatus);
        }
    });
    app.get("/firebase/lockstatus/:id", function (req, res) {
        var ref = firestore.collection('locks').doc(req.params.id);
        ref.get().then((snapshot) => {
            res.status(200).send(snapshot.data().lock_status);
        })
    })
}

module.exports = appRouter;