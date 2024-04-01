require('dotenv').config({path: "sample.env"});
const express = require('express');
const app = express();
const cors = require('cors');
const mongodb = require('mongodb');
 
const client = new mongodb.MongoClient(process.env.KEY, {
    serverApi: {
        version: mongodb.ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function main() {
    await client.connect();

    const db = client.db("BASE");
    db.createCollection("users", {
        validationLevel: "strict", 
        validationAction: "error", 
        validator: {
            $jsonSchema: {
                bsonType: "object",
                title: "User Object Validation",
                required: ["username"],
                properties: {
                    username: {
                        bsonType: "string",
                        description: "'name' must be a string and is required"
                    },
                    logs: {
                        bsonType: "array",
                        items: {
                            bsonType: "object",
                            properties: {
                                date: {
                                    bsonType: "date",
                                    description: "'date' must be a valid date and is required"
                                },
                                duration: {
                                    bsonType: "int",
                                    minimum: 0,
                                    description: "'duration' must be a positive integer and is required"
                                },
                                desc: {
                                    bsonType: "string",
                                    description: "description must be a string and is required"
                                }
                            }
                        }
                    }
                }
            }
        }
    });
    const users = db.collection("users");
    const result = await users.deleteMany({});

    app.use(cors());
    app.use(express.static('public'));
    app.get('/', (req, res) => { res.sendFile(__dirname + '/views/index.html'); });

    app.use(express.urlencoded({extended: false}));
    app.post("/api/users", async (req, res) => {
        let username = req.body.username.length ? req.body.username : null;
        await users.insertOne({
            username: username
        }).then(val => {
            let response = {
                username: username,
                _id: val.insertedId,
            };
            res.json(response);
        }).catch(err => res.send(`<div><pre>${err.stack}</pre></div>`));
    });

    app.use(express.urlencoded({extended: false}));
    app.get("/api/users/:_id/logs", async (req, res) => {
        try {
            let from = new Date(req.query.from);
            let to = new Date(req.query.to);
            let lim = Number(req.query.limit);
            console.log("from: ", from);
            console.log("to: ", to);
            console.log('limit: ', lim);
            // console.log('id: ', new mongodb.ObjectId(req.params._id));
            let response = {
                username: undefined,
                count: undefined,
                _id: undefined,
                from: undefined,
                to: undefined,
                log: undefined
            }
            let condition = {}
            let gte = ["$$dateEntry.date", from];
            let lte = ["$$dateEntry.date", to];
            
            if (!isNaN(from)) {
                response["from"] = from.toDateString();
                condition["$gte"] = gte;
                console.log("gte: " + gte);
            }
            if (!isNaN(to)) {
                response["to"] = to.toDateString();
                condition["$lte"] = lte;
                console.log("lte: " + lte);
            }
            console.log(condition);
            if (Object.keys(condition).length === 2) {
                condition = {
                    $and: [
                        { $gte: gte },
                        { $lte: lte }
                    ]
                }
            }
            let filter = {
                $filter: {
                    input: "$logs",
                    as: "dateEntry",
                    cond: Object.keys(condition).length > 0 ? condition : 1,
                }
            };
            if (!isNaN(lim)) {
                filter = { $slice: [ filter, lim ] };
            }
            console.log(filter);
            // if (isNaN(limit) || limit <= 0) {
            //     delete filter["$filter"]["limit"];
            // };
            // if (Object.keys(condition).length === 0)  {
            //     delete filter["$filter"]["cond"];
            // };
            let pipeline = [
                { $match: { _id: new mongodb.ObjectId(req.params._id) } },
                {
                    $project: {
                        username: 1,
                        logs: { 
                            $ifNull: 
                            [ filter , [] ] 
                        },
                    }
                }
            ];
            let user = users.aggregate(pipeline).next().then(doc => {
                response["_id"] = doc["_id"];
                response["username"] = doc["username"];
                response["log"] = doc["logs"];
                response["count"] = response["log"].length;
                response["log"].forEach((log) => {
                    log.date = log.date.toDateString();
                });
                res.json(response);
            }).catch(err => {
                console.error(err.stack);
                res.send(`<div><pre>${err.stack}</pre></div>`)
            });
            await user;
        } catch (err) { 
            res.send(`<div><pre>${err.stack}</pre></div>`); }
    });

    app.get("/api/users", async (req, res) => {
        await users.find({}).project({logs: false}).toArray().then(vals => {
            vals.forEach((val, idx) => {
                vals[idx] = {
                    _id: val._id,
                    username: val.username
                };
            });
            res.json(vals);
        }).catch(err => res.send(`<div><pre>${err.stack}</pre></div>`));
    });

    app.use(express.urlencoded({extended: false}));
    app.post("/api/users/:_id/exercises", async (req, res) => {
        const id = new mongodb.ObjectId(req.params._id);
        let user = await users.findOne({_id: id} ,{projection: {username: true}});
        let date = req.body.date ? new Date(req.body.date) : new Date();
        let duration = Number(req.body.duration);
        await users.updateOne({_id: id}, {
            $push: {
                logs: {
                    description: req.body.description,
                    date: date,
                    duration: duration,
                }
            }
        }).then(() => { 
            if (isNaN(date.getTime())) throw new TypeError("Received invalid date.");
            if (isNaN(duration)) duration = null;
            let response = {
                _id: user._id,
                username: user.username,
                date: date.toDateString(),
                description: req.body.description,
                duration: duration
            };
            res.json(response);
        }).catch(err => res.send(`<div><pre>${err.stack}</pre></div>`));
    });
    
    const listener = app.listen(process.env.PORT || 3000, () => {
        console.log('Your app is listening on port ' + listener.address().port);
    });

    process.on('SIGINT', async () => {
        console.log('Received keyboard interrupt.');
        process.exit(0);
    });

    process.on('exit', async () => {
        console.log('Exiting process... MongoDB connection closed.');
        await client.close();
    });
}

let a = "66078939d985d271eb7d05f3";
let b = "66078941d985d271eb7d05f4";
let c = "660789f133ec6011b56bc2a5";

main();