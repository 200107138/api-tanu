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
			socket.on("connected", async function (_chat_room_id, access_token) {
				try {
					// Use auth middleware to get user_id from access token
					const user_id = getUserIdFromAccessToken(access_token);
					
					// Add user_id to the chat room
					chat_rooms[_chat_room_id][user_id] = socket.id;
				} catch (error) {
					console.error("Error while processing connected event:", error);
				}
			});
		
			socket.on("newMessage", async function (message, access_token) {
				try {
					// Use auth middleware to get user_id from access token
					const user_id = getUserIdFromAccessToken(access_token);
					
					// Fetch participants from database based on message._id (assuming this is the chat room ID)
					const participants = await getParticipants(message._id);
					
					// Find receiver user_id (assuming there are only 2 participants)
					const receiver_id = participants.find(id => id !== user_id);
					
					// Emit new message to the receiver
					socketIO.to(chat_rooms[message._id][receiver_id]).emit("newMessage", JSON.stringify(message));
				} catch (error) {
					console.error("Error while processing newMessage event:", error);
				}
			});
		});
		
		// Function to retrieve user_id from access token using the auth middleware
		function getUserIdFromAccessToken(access_token) {
			// Implement logic to extract user_id from access_token using the auth middleware
			// For example:
			const decoded = jwt.verify(access_token, global.jwtSecret);
			return decoded.userId;
		}
		
		// Function to fetch participants based on chat room ID from the database
		async function getParticipants(chat_room_id) {
			try {
				// Fetch participants from the user_chat_rooms collection based on the chat_room_id
				const participants = await global.db.collection("user_chat_rooms").find({
					chat_room_id: new ObjectId(chat_room_id)
				}).toArray();
		
				// Extract user IDs from the participants
				const userIds = participants.map(participant => participant.user_id);
		
				return userIds;
			} catch (error) {
				console.error("Error fetching participants:", error);
				throw error; // Throw the error to handle it in the caller function
			}
		}
		
		

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
        user_id: user._id.toString(),
        fingerprint: {
            user_agent: userAgent,
            accept_headers: acceptHeaders,
            geoip: geoip
        }
    }, global.jwtSecret, { expiresIn: "15m" });

    const refreshToken = jwt.sign({
        user_id: user._id.toString(),
        fingerprint: {
            user_agent: userAgent,
            accept_headers: acceptHeaders,
            geoip: geoip
        }
    }, global.jwtSecret);

    // Store refresh session in database
    await global.db.collection("refresh_sessions").insertOne({
        user_id: user._id.toString(),
        refresh_token: refreshToken,
        fingerprint: {
            userAgent: userAgent,
            acceptHeaders: acceptHeaders,
            geoip: geoip
        }
    });

    result.json({
        user_id: user._id,
        status: "success",
        message: "Login successfully.",
        access_token: accessToken,
        refresh_token: refreshToken
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
				created_at: createdAt
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
				user_id: newUser.insertedId.toString(),
				refresh_token: refreshToken,
				fingerprint: fingerprint
			})
		
			result.json({
				status: "success",
				message: "Account has been created. Please login now.",
			})
		})
		
	})
})

app.get("/getChatRooms", auth, async function (request, result) {
    const user_id = request.user._id; // Retrieve userId from the authenticated user object

    try {
        // Fetch all chat room ids associated with the current user
        const user_chat_room_ids = await global.db.collection("user_chat_rooms")
            .find({ user_id: user_id })
            .toArray()
            .map(user_chat_room => user_chat_room.chat_room_id);

        // Fetch chat room information for the retrieved chat room ids
        const chat_rooms = await global.db.collection("chat_rooms")
            .find({ _id: { $in: user_chat_room_ids } })
            .toArray();

        result.json({
            status: "success",
            message: "Chat rooms retrieved successfully.",
            chat_rooms: chat_rooms
        });
    } catch (error) {
        result.json({
            status: "error",
            message: "Error fetching chat rooms.",
            error: error.message
        });
    }
});


app.get("/getMessages", auth, async function (request, result) {
    const user_id = request.user._id; // Retrieve userId from the authenticated user object
    const provided_chat_room_id = request.query.chat_room_id; // Retrieve chatroomId from the request query parameters

    try {
        // Check if the user is authorized to access the provided chat room
        const user_chat_room = await global.db.collection("user_chat_rooms").findOne({
            user_id: user_id,
            chat_room_id: provided_chat_room_id
        });

        if (!user_chat_room) {
            result.json({
                status: "error",
                message: "User is not authorized to access this chat room."
            });
            return;
        }

        // Fetch all messages for the provided chat room
        const messages = await global.db.collection("messages").find({
            chat_room_id: provided_chat_room_id
        }).toArray();

        result.json({
            status: "success",
            message: "Messages retrieved successfully.",
            messages: messages
        });
    } catch (error) {
        result.json({
            status: "error",
            message: "Error fetching messages.",
            error: error.message
        });
    }
});
