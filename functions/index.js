/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const functions = require("firebase-functions");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

exports.getAllPosts = functions.https.onRequest(async (req, res) => {
  try {
    const postsSnapshot = await admin.firestore().collection("posts").get();
    const posts = [];

    postsSnapshot.forEach((doc) => {
      posts.push({
        postId: doc.get("postId"),
        description: doc.get("description"),
        likes: doc.get("likes"),
        mediaUrl: doc.get("mediaUrl"),
        userId: doc.get("userId"),
        tags: doc.get("tags")
      });
    });

    res.status(200).json(posts);
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).send("Error fetching posts");
  }
});

// Login function
exports.login = functions.https.onRequest(async (req, res) => {
  try {
    const { email, password } = req.query; // Extract email and password from query parameters
    
    // Validate if email and password are provided
    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required' });
      return;
    }
    
    // Retrieve the user by email
    const userRecord = await admin.auth().getUserByEmail(email);
    
    // Get the user data from the Firestore document
    const userData = (await admin.firestore().collection('users').doc(userRecord.uid).get()).data();
    
    // Check if the user data exists and the password matches
    if (!userData || userData.password !== password) {
      res.status(400).json({ message: 'Incorrect email or password' });
      return;
    }
    
    // Construct the User object from retrieved data
    const user = {
      userId: userRecord.uid,
      displayName: userData.displayName,
      email: userRecord.email,
      avatarUrl: userData.avatarUrl
    };

    // Create the LoginResponse object
    const loginResponse = {
      user: user,
      message: "Login successful"
    };
    
    res.status(200).json(loginResponse);
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(400).json({ message: error.message });
  }
});

// Register function
exports.register = functions.https.onRequest(async (req, res) => {
  try {
    const {email, password} = req.body;
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: "createdUser",
    });

    // Save additional user data to Firestore
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      userId: userRecord.uid,
      displayName: "createdUser",
      email: email,
      password: password,
      registrationDate: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(200).json({message: "success"});
  } catch (error) {
    console.error('Error registering:', error);
    res.status(400).json({ message: error.message });
  }
});

// Post Comment function
exports.postComment = functions.https.onRequest(async (req, res) => {
  try {
    // Extract comment text and post_id from request body
    const { text, post_id } = req.body;

    // Extract BasicAuth credentials from request headers
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) {
      throw new Error('Unauthorized');
    }

    // Decode and validate BasicAuth credentials
    const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString();
    const [email, password] = credentials.split(':');

    // Retrieve user by email
    const userRecord = await admin.auth().getUserByEmail(email);

    // Get the password from the user document
    const storedPasswordSnapshot = await admin.firestore().collection('users').doc(userRecord.uid).get();
    const storedPassword = storedPasswordSnapshot.data().password;

    // Compare the provided password with the stored one
    if (password !== storedPassword) {
      throw new Error('Unauthorized');
    }

    // Create a new document in the comments collection
    await admin.firestore().collection('comments').add({
      post_id: post_id,
      text: text,
      user_id: userRecord.uid,
      created: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({ message: 'Comment posted successfully' });
  } catch (error) {
    console.error('Error posting comment:', error);
    res.status(401).json({ message: 'Unauthorized' });
  }
});

exports.getConversations = functions.https.onRequest(async (req, res) => {
  try {
      // Extract BasicAuth credentials from request headers
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith('Basic ')) {
          throw new Error('Unauthorized');
      }
      const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString();
      const [email, password] = credentials.split(':');

      // Authenticate the user
      const userRecord = await admin.auth().getUserByEmail(email);
     // Get the password from the user document
     const storedPasswordSnapshot = await admin.firestore().collection('users').doc(userRecord.uid).get();
     const storedPassword = storedPasswordSnapshot.data().password;
 
     // Compare the provided password with the stored one
     if (password !== storedPassword) {
       throw new Error('Unauthorized');
     }
      // Fetch conversations where the given user_id is a participant
      const conversationsSnapshot = await admin.firestore()
          .collection('conversations')
          .where('participants', 'array-contains', userRecord.uid)
          .get();

      // Extract conversation data from snapshot
      const conversations = [];
      conversationsSnapshot.forEach((doc) => {
          conversations.push(doc.data());
      });

      res.status(200).json(conversations);
  } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(401).json({ message: 'Unauthorized' });
  }
});

exports.getMessages = functions.https.onRequest(async (req, res) => {
  try {
      // Extract BasicAuth credentials from request headers
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith('Basic ')) {
          throw new Error('Unauthorized');
      }
      const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString();
      const [email, password] = credentials.split(':');

      // Authenticate the user
      const userRecord = await admin.auth().getUserByEmail(email);
      // Get the password from the user document
      const storedPasswordSnapshot = await admin.firestore().collection('users').doc(userRecord.uid).get();
      const storedPassword = storedPasswordSnapshot.data().password;

      // Compare the provided password with the stored one
      if (password !== storedPassword) {
          throw new Error('Incorrect password');
      }

      // Extract conversation ID from request query parameters
      const conversationId = req.query.conversationId;
      if (!conversationId) {
          throw new Error('Conversation ID is required');
      }

      // Fetch conversation document
      const conversationDoc = await admin.firestore().collection('conversations').doc(conversationId).get();
      if (!conversationDoc.exists) {
          throw new Error('Conversation not found');
      }

      // Check if the authenticated user is a participant in the conversation
      const conversationData = conversationDoc.data();
      if (!conversationData.participants.includes(userRecord.uid)) {
          throw new Error('Unauthorized in chat');
      }

      // Fetch messages from the messages subcollection of the conversation
      const messagesSnapshot = await admin.firestore().collection('conversations').doc(conversationId).collection('messages').get();

      // Extract message data from snapshot and fetch user info for each message
      const messages = [];
      for (const doc of messagesSnapshot.docs) {
          const messageData = doc.data();
          const userInfoRef = messageData.userInfo;
          if (userInfoRef) {
              const userInfoDoc = await userInfoRef.get();
              if (userInfoDoc.exists) {
                  const userInfo = userInfoDoc.data();
                  // Include avatarUrl obtained from userInfo
                  messages.push({
                      message_date: messageData.message_date,
                      message_id: messageData.message_id,
                      message_text: messageData.message_text,
                      sender_avatar: userInfo.avatar,
                      sender_id: userInfo.uid,
                      sender_name: userInfo.displayName 
                  });
              }
          }
      }

      res.status(200).json(messages);
  } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(401).json({ message: error });
  }
});

exports.postMessage = functions.https.onRequest(async (req, res) => {
  try {
    // Extract BasicAuth credentials from request headers
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) {
      res.status(400).json({ message: 'Unauthorized' });
      return;
    }
    const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString();
    const [email, password] = credentials.split(':');

    // Authenticate the user
    const userRecord = await admin.auth().getUserByEmail(email);
    const storedPasswordSnapshot = await admin.firestore().collection('users').doc(userRecord.uid).get();
    const storedPassword = storedPasswordSnapshot.data().password;

    // Compare the provided password with the stored one
    if (password !== storedPassword) {
      res.status(400).json({ message: 'Incorrect email or password' });
      return;
    }

    const { conversationId, messageText } = req.body;
    const currentUserId = userRecord.uid;

    // Check if conversation exists and if current user is a participant
    const conversationRef = admin.firestore().collection('conversations').doc(conversationId);
    const conversationSnapshot = await conversationRef.get();

    if (!conversationSnapshot.exists) {
      res.status(400).json({ message: 'Conversation does not exist' });
      return;
    }

    const conversationData = conversationSnapshot.data();
    const userId1 = conversationData.userId1;
    const userId2 = conversationData.userId2;

    if (userId1 !== currentUserId && userId2 !== currentUserId) {
      res.status(400).json({ message: 'You are not a participant in this conversation' });
      return;
    }

    // Create new message document in the messages collection
    const messagesCollection = conversationRef.collection('messages');
    const messageData = {
      messageDate: admin.firestore.Timestamp.now(),
      messageText: messageText,
      senderId: currentUserId,
      conversationId: conversationId
    };

    await messagesCollection.add(messageData);

    res.status(200).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error posting message:', error);
    res.status(400).json({ message: error.message });
  }
});

