const express = require("express")
const app = express()
const expressFingerprint = require('express-fingerprint');
const http = require("http").createServer(app)
require('dotenv').config();

app.use(function (req, res, next) {
 
    // Website you wish to allow to connect
    res.setHeader("Access-Control-Allow-Origin", "*")
 
    // Request methods you wish to allow
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE")
 
    // Request headers you wish to allow
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With,content-type,Authorization")
 
    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader("Access-Control-Allow-Credentials", true)
 
    // Pass to next layer of middleware
    next()
})

// module required for parsing FormData values
const expressFormidable = require("express-formidable")
 
// setting the middleware
app.use(expressFormidable())
app.use(expressFingerprint({
	parameters: [
	  // Defaults
	  expressFingerprint.useragent,
	  expressFingerprint.acceptHeaders,
	  expressFingerprint.geoip
	]
  }));
// and verify the password as well
const bcryptjs = require("bcryptjs")

// sockets are used for realtime communication
const socketIO = require("socket.io")(http, {
    cors: {
        origin: "*"
    }
})

const mongodb = require("mongodb")
const MongoClient = mongodb.MongoClient
const ObjectId = mongodb.ObjectId
const fileSystem = require("fs")

// JWT used for authentication
const jwt = require("jsonwebtoken")

// secret JWT key
global.jwtSecret = "jwtSecret1234567890"

const auth = require("./modules/auth")
const MONGODB_CONNECT_URI = process.env.MONGODB_CONNECT_URI
const users = []

const PORT = process.env.PORT
http.listen(PORT, "0.0.0.0", function () {
	console.log("Server started: " + PORT)

	// connect with database

// Connect to MongoDB
MongoClient.connect(MONGODB_CONNECT_URI)
  .then(client => {
		global.db = client.db("tanu")
       
	    console.log("Database connected")
        
        app.get("/", (request, result) => {
		    result.send("пкепекепек")
		})
		socketIO.on("connection", function (socket) {
			socket.on("connected", function (_id) {
				users[_id] = socket.id
			})

			socket.on("allMessagesRead", function (receiverID, myID) {
				socketIO.to(users[receiverID]).emit("allMessagesRead-" + myID, "1")
			})

			socket.on("messageRead", async function (message) {
				message = JSON.parse(message)

				await global.db.collection("users").findOneAndUpdate({
                    $and: [{
                        _id: ObjectId(message.receiver._id)
                    }, {
                        "contacts._id": ObjectId(message.sender._id)
                    }]
                }, {
                    $set: {
                        "contacts.$.hasUnreadMessage": 0
                    }
                })

                await db.collection("messages").findOneAndUpdate({
                    _id: ObjectId(message._id)
                }, {
                    $set: {
                        isRead: true
                    }
                })

				socketIO.to(users[message.sender._id]).emit("messageRead", JSON.stringify(message))
			})

			socket.on("newMessage", function (message) {
				message = JSON.parse(message)
				socketIO.to(users[message.receiver._id]).emit("newMessage", JSON.stringify(message))
			})
		})

	    app.post("/saveFCMToken", auth, async function (request, result) {
		    const user = request.user
		    const token = request.fields.token

		    if (!token) {
		    	result.json({
			        status: "error",
			        message: "Please fill all fields."
			    })
			    return
		    }
		 
		    // update JWT of user in database
		    await global.db.collection("users").findOneAndUpdate({
		        _id: user._id
		    }, {
		        $set: {
		            fcmToken: token
		        }
		    })
		 
		    result.json({
		        status: "success",
		        message: "Token saved successfully."
		    })
		})

	    // route for logout request
		app.post("/logout", async function (request, result) {
			const refreshToken = request.fields.refreshToken
		
			// Delete refresh session from database based on refreshToken
			await global.db.collection("refresh_sessions").deleteOne({
				refreshToken: refreshToken
			})
		
			result.json({
				status: "success",
				message: "Logout successfully."
			})
		})
		

		app.post("/updateProfile", auth, async function (request, result) {
		    const user = request.user
			const name = request.fields.name ?? ""
			const base64 = request.fields.base64 ?? ""

			if (!name) {
				result.json({
					status: "error",
					message: "Please enter all fields."
				})

				return
			}

			if (base64) {
				const filePath = "uploads/profiles/" + user._id + ".png"
				fileSystem.writeFile(filePath, base64, "base64", function (error) {
					if (error) {
						console.log(error)
					}
				})

				await db.collection("users").findOneAndUpdate({
					_id: user._id
				}, {
					$set: {
						name: name,
						image: filePath
					}
				})
			} else {
				await db.collection("users").findOneAndUpdate({
					_id: user._id
				}, {
					$set: {
						name: name
					}
				})
			}
		 
		    result.json({
		        status: "success",
		        message: "Profile has been updated."
		    })
		})

		app.post("/fetchUser", auth, async function (request, result) {
			const user = request.user
			const _id = request.fields._id ?? ""

			if (!_id) {
				result.json({
					status: "error",
					message: "Required parameter _id is missing."
				})

				return
			}

			const userObj = await db.collection("users").findOne({
				_id: ObjectId(_id)
			})

			if (userObj == null) {
				result.json({
					status: "error",
					message: "User does not exists."
				})

				return
			}

			const exists = await fileSystem.existsSync(userObj.image)
			if (exists) {
				userObj.image = apiURL + "/" + userObj.image
			} else {
				userObj.image = ""
			}
		 
		    result.json({
		        status: "success",
		        message: "Data has been fetched.",
		        user: {
					_id: userObj._id,
					name: userObj.name,
					phone: userObj.phone,
					image: userObj.image,
					createdAt: userObj.createdAt
				},
				me: user
		    })
		})

	    app.post("/getUser", auth, async function (request, result) {
		    const user = request.user
		 
		    result.json({
		        status: "success",
		        message: "Data has been fetched.",
		        user: user
		    })
		})


	    // route for login requests
		app.post("/login", async function (request, result) {
			console.log("login called");
    const email = request.fields.email;
    const password = request.fields.password;
    
    // Get the fingerprint data from the request
    const fingerprintData = request.fingerprint;
    const userAgent = fingerprintData.useragent;
    const acceptHeaders = fingerprintData.acceptHeaders;
    const geoip = fingerprintData.geoip;

    // Check if user exists
    const user = await global.db.collection("users").findOne({
        email: email
    });

    if (!user) {
        result.json({
            status: "error",
            message: "User does not exist."
        });
        return;
    }

    // Verify password
    const isVerify = await bcryptjs.compareSync(password, user.password);

    if (!isVerify) {
        result.json({
            status: "error",
            message: "Password is incorrect."
        });
        return;
    }

    // Generate access and refresh tokens
    const accessToken = jwt.sign({
        userId: user._id.toString(),
        fingerprint: {
            userAgent: userAgent,
            acceptHeaders: acceptHeaders,
            geoip: geoip
        }
    }, global.jwtSecret, { expiresIn: "15m" });

    const refreshToken = jwt.sign({
        userId: user._id.toString(),
        fingerprint: {
            userAgent: userAgent,
            acceptHeaders: acceptHeaders,
            geoip: geoip
        }
    }, global.jwtSecret);

    // Store refresh session in database
    await global.db.collection("refresh_sessions").insertOne({
        userId: user._id.toString(),
        refreshToken: refreshToken,
        fingerprint: {
            userAgent: userAgent,
            acceptHeaders: acceptHeaders,
            geoip: geoip
        }
    });

    result.json({
        userId: user._id,
        status: "success",
        message: "Login successfully.",
        accessToken: accessToken,
        refreshToken: refreshToken
    });
});

		
	 
	    app.post("/register", async function (request, result) {
			const email = request.fields.email
			const password = request.fields.password
			const createdAt = new Date().getTime()
		
			if (!email || !password) {
				result.json({
					status: "error",
					message: "Please enter all values."
				})
				return
			}
		
			// Check if user already exists
			const existingUser = await global.db.collection("users").findOne({
				email: email
			})
		
			if (existingUser) {
				result.json({
					status: "error",
					message: "User already exists."
				})
				return
			}
		
			const salt = await bcryptjs.genSaltSync(10)
			const hash = await bcryptjs.hashSync(password, salt)
		
			// Add user to database
			const newUser = await global.db.collection("users").insertOne({
				email: email,
				password: hash,
				createdAt: createdAt
			})
		
			// Generate fingerprint
			const fingerprint = expressFingerprint({parameters: [
				// Defaults
				expressFingerprint.useragent,
				expressFingerprint.acceptHeaders,
				expressFingerprint.geoip
			]})(request, {}, () => {})
		
			// Generate access and refresh tokens
			const accessToken = jwt.sign({
				userId: newUser.insertedId.toString(),
				fingerprint: fingerprint
			}, global.jwtSecret, { expiresIn: "30m" })
		
			const refreshToken = jwt.sign({
				userId: newUser.insertedId.toString(),
				fingerprint: fingerprint
			}, global.jwtSecret)
		
			// Store refresh session in database
			await global.db.collection("refresh_sessions").insertOne({
				userId: newUser.insertedId.toString(),
				refreshToken: refreshToken,
				fingerprint: fingerprint
			})
		
			result.json({
				status: "success",
				message: "Account has been created. Please login now.",
			})
		})
		
	})
})

app.get("/getConversations", auth, async function (request, result) {
    const userId = request.user._id; // Retrieve userId from the authenticated user object
    
    try {
        // Find all conversations where the userId is either userId1 or userId2
        const conversations = await global.db.collection("conversations").find({
            $or: [
                { userId1: userId },
                { userId2: userId }
            ]
        }).toArray();

        result.json({
            status: "success",
            message: "Conversations retrieved successfully.",
            conversations: conversations
        });
    } catch (error) {
        result.json({
            status: "error",
            message: "Error fetching conversations.",
            error: error.message
        });
    }
});
