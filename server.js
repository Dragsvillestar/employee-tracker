require('dotenv').config();
const express = require('express');
const path = require('path');
const paymentRoute = require("./payment.js");
const axios = require('axios');
const { db, auth } = require("./firebase"); 
const managerRoute = require("./manager.js");
const workerRoute = require("./worker.js");
const subordinatesRoute = require("./subordinates.js");
const recordsRoute = require("./records.js");
const phoneLoginRoute = require("./phone_auth.js");
const cors = require('cors');

const app = express();
const { Server } = require("socket.io");
const http = require("http");
const server = http.createServer(app);
const io = require("socket.io")(server);



const PORT = 3000;

app.set("view engine", "pug");
app.use(express.json()); // For JSON payloads
app.use(express.urlencoded({ extended: true }));

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));
app.use("/payment",paymentRoute);
app.use("/manager",managerRoute);
app.use("/subordinates", subordinatesRoute);
app.use("/records", recordsRoute);
app.use("/worker", workerRoute);
app.use("/phone_login", phoneLoginRoute);

// Route to serve "serverindex.html"
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/manager/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'indexm1.html'));
});
const formatPhoneNumber = (phone) => {
  if (phone.startsWith("0")) {
      return "+234" + phone.slice(1); // Convert 081... to +23481...
  }
  return phone; // If already in E.164 format, keep it
};

const admin = require("firebase-admin");

// Ensure Firebase Admin SDK is initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(require("./firebase-admin-sdk.json")) // Use your service account JSON
    });
}

app.post("/check-user", async (req, res) => {
    try {
        console.log("🔹 /check-user API hit!");
        console.log("Received data:", req.body);

        const { email, phoneNumber } = req.body;
        if (!email && !phoneNumber) {
            return res.status(400).json({ success: false, message: "Missing email or phone number" });
        }

        const formattedPhoneNumber = phoneNumber ? formatPhoneNumber(phoneNumber) : null;

        // ✅ Reference to Firestore "admin" collection inside "users2/app_owner"
        const adminRef = db.collection("user2").doc("app_owner").collection("admin");

        let emailExists = false;
        let phoneExists = false;

        // 🔍 Check Firestore (Admin Collection)
        if (email) {
            const adminEmailSnap = await adminRef.where("email", "==", email).get();
            emailExists = !adminEmailSnap.empty;
        }

        if (formattedPhoneNumber) {
            const adminPhoneSnap = await adminRef.where("phoneNumber", "==", formattedPhoneNumber).get();
            phoneExists = !adminPhoneSnap.empty;
        }

        // 🚨 Check Firebase Authentication for email
        if (!emailExists && email) {
            try {
                await admin.auth().getUserByEmail(email);
                emailExists = true;
                console.log("✅ Email found in Firebase Authentication:", email);
            } catch (error) {
                if (error.code !== "auth/user-not-found") {
                    console.error("❌ Error checking Firebase Authentication (Email):", error);
                }
            }
        }

        // 🚨 Check Firebase Authentication for phone number
        if (!phoneExists && formattedPhoneNumber) {
            try {
                await admin.auth().getUserByPhoneNumber(formattedPhoneNumber);
                phoneExists = true;
                console.log("✅ Phone number found in Firebase Authentication:", formattedPhoneNumber);
            } catch (error) {
                if (error.code !== "auth/user-not-found") {
                    console.error("❌ Error checking Firebase Authentication (Phone):", error);
                }
            }
        }

        console.log("Final Check → Email Exists:", emailExists, "| Phone Exists:", phoneExists);

        // 🔹 Return appropriate response
        if (emailExists && phoneExists) {
            return res.status(200).json({ exists: true, message: "Both email and phone number are already in use." });
        } else if (emailExists) {
            return res.status(200).json({ exists: true, message: "Email is already in use." });
        } else if (phoneExists) {
            return res.status(200).json({ exists: true, message: "Phone number is already in use." });
        }

        res.status(200).json({ exists: false, message: "Email and phone number are available." });

    } catch (error) {
        console.error("❌ Error checking user:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post('/logout', async (req, res) => {
    const { userPath } = req.body;

    if (!userPath) {
        return res.status(400).json({ error: 'userPath is required' });
    }

    try {
        const docRef = db.doc(userPath);
        const snapshot = await docRef.get();

        if (!snapshot.exists) {
            return res.status(404).json({ error: 'User document not found' });
        }

        const userData = snapshot.data();
        const uid = userData?.uid;

        if (!uid) {
            return res.status(400).json({ error: 'UID not found in document' });
        }

        await admin.auth().revokeRefreshTokens(uid);
        console.log("token revoked");
        return res.status(200).json({ message: 'Refresh tokens revoked for UID', uid });

    } catch (error) {
        console.error('Logout error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ✅ Protected Route - Verifies Firebase Token
app.post("/verify-token", async (req, res) => {
  try {
      const { token } = req.body;

      // ✅ Verify Firebase Token using `auth`
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;
      console.log("✅ Token verified for user:", userId);

      // 🔹 Get User Email from Firebase Authentication
      const userRecord = await auth.getUser(userId);
      const email = userRecord.email;
       console.log("email:",email)
      // 🔹 Fetch User Data from Firestore using email
      const userDocs = await db.collection("user2")
          .doc("app_owner")
          .collection("admin")
          .where("email", "==", email)
          .get();

      if (userDocs.empty) {
          return res.status(404).json({ error: "User data not found" });
      }

      const userData = userDocs.docs[0].data();
      return res.status(200).json(userData);

  } catch (error) {
      console.error("❌ Token Verification Error:", error.message);
      return res.status(401).json({ error: "Invalid token" });
  }
});

app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index3.html'));
});

// Express route
app.get('/reverse-geocode', async (req, res) => {
    const { lat, lon } = req.query;
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'YourAppName/1.0 (your@email.com)',
            }
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Reverse geocoding failed' });
    }
});

async function sendPushNotification(token, title, body) {
    try {
        const message = {
            token: token, // User's FCM token
            notification: {
                title: title,  // Title of the notification
                body: body,    // Body of the notification
            },
            data: {
                route: '/notifications',
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
            }, 
        };

        // Send the notification
        const response = await admin.messaging().send(message);
        console.log('✅ Successfully sent message:', response);
        return response; // Optional: Return the response to the caller
    } catch (error) {
        const errorCode = error?.code || error?.errorInfo?.code;

        if (errorCode === 'messaging/registration-token-not-registered') {
            console.warn(`⚠️ Token not registered. Consider removing it from Firestore.`);
            // removeTokenFromFirestore(userId);
        } else {
            console.error('❌ Error sending message:', error);
        }
    }
}

io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token; // Get token from client
        if (!token) throw new Error("No token provided");

        const decodedToken = await auth.verifyIdToken(token); // Verify token
        socket.user = decodedToken; // Attach user data to socket
        next();
    } catch (error) {
        console.error("❌ Invalid token:", error.message);
        next(new Error("Authentication error"));
    }
});

const userSockets = {}; // Store user socket IDs
let onlineUsers = {};
io.on("connection", async (socket) => {
    console.log("✅ Socket connected:", socket.id);
    const { token, targetUID, managerUID, adminID, managerID, push_token } = socket.handshake.auth;

    if (!token) {
        console.log("❌ No token provided.");
        return socket.disconnect();
    }

    try {
        // Verify the token using Firebase Admin SDK
        const decodedToken = await auth.verifyIdToken(token);
        console.log("✅ Token verified:", decodedToken);
        console.log("✅ Token:", token);

        // Attach user details to socket
        const userDetails = {
            uid: decodedToken.uid,
            displayName: decodedToken.name || "Unknown",
            email: decodedToken.email || "No Email",
            phone: decodedToken.phone_number || null,
            role: decodedToken.role || "user",
        };

        // Prevent multiple logins
        if (userSockets[userDetails.uid]) {
            console.log(`❌ Duplicate login attempt for UID ${userDetails.uid}`);
            socket.emit("multiple_login_refusal", {
                message: "You are already logged in from another device.",
            });
            return socket.disconnect(); 
        }

        // Save to memory
        socket.user = userDetails;
        userSockets[userDetails.uid] = socket.id;
        onlineUsers[userDetails.uid] = userDetails;
        let onlineList = Object.values(onlineUsers);

        console.log("Online list:", onlineList);
        console.log(`🟢 ${userDetails.displayName} (${userDetails.role}) connected.`);
        console.log(`🔹 User Connected: ${socket.user.displayName}, UID: ${socket.user.uid}`);

        const adminRef = db.collection("user2").doc("app_owner").collection("admin").doc(adminID);
        if (decodedToken.role === "admin") {
            const notificationsRef = adminRef.collection("notifications");
            const presenceRef = adminRef.collection("presence").doc("loggedInEmployees");
            const currentDate = new Date().toISOString().split('T')[0];

            const snapshot = await notificationsRef.get();

            const previousMessages = snapshot.docs.map(doc => ({
                id: doc.id, // Add the document ID
                ...doc.data() // Spread the data of the notification document
            }));

            socket.emit("previousMessages", previousMessages);
            setInterval(() => { onlineList = Object.values(onlineUsers); socket.emit("onlineCheck", onlineList) }, 5000);
            // const presenceSnapshot = await presenceRef.get();
            // const storedData = presenceSnapshot.exists ? presenceSnapshot.data() : null;

            // if (storedData && storedData.date !== currentDate) {
            //     // If the date has changed, overwrite the list
            //     await presenceRef.set({
            //         list: [], // Reset with the current user
            //         date: currentDate, // Store today's date
            //     });
            //     socket.emit("CLockedInCount", presenceSnapshot.data());
            // }
        }
        if (decodedToken.role === "manager") {
            const notificationsRef = adminRef.collection("managers").doc(managerID).collection("notifications");
            const presenceRef = adminRef.collection("presence").doc("loggedInEmployees");
            if (push_token) {
                await adminRef.collection("managers").doc(managerID).set({
                    pushToken: push_token
                }, { merge: true });
            }
            const currentDate = new Date().toISOString().split('T')[0];

            const snapshot = await notificationsRef.get();

            const previousMessages = snapshot.docs.map(doc => ({
                id: doc.id, // Add the document ID
                ...doc.data() // Spread the data of the notification document
            }));

            socket.emit("previousMessages", previousMessages);
            setInterval(() => { onlineList = Object.values(onlineUsers);socket.emit("onlineCheck", onlineList) }, 5000);
        }
        // Handle notifications when a targetUID is provided
        if (targetUID) {
            socket.targetUID = targetUID;
            console.log(`🔹 User's Target Admin UID: ${targetUID}`);

            const messageData = {
                sender: socket.user.displayName,
                message: `${socket.user.displayName} just logged in!`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            };

            const targetRef = db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("notifications");
            await targetRef.add(messageData);
            if (managerUID) {
                socket.managerUID = managerUID;
                const managerRef = db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("managers").doc(managerID).collection("notifications");
                await managerRef.add(messageData);
                const managerDoc = await db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("managers").doc(managerID).get();

                if (managerDoc.exists) {
                    const mPushToken = managerDoc.data().pushToken;
                    if (mPushToken) {
                        console.log("Retrieved Push Token:", mPushToken);
                        sendPushNotification(mPushToken, "Log In Notifier", messageData.message); 
                    }                    
                } else {
                    console.log("No push token for manager!");
                }

            }
            if (userSockets[targetUID]) {

                const snapshot = await targetRef.get();
                const allMessages = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                io.to(userSockets[targetUID]).emit("previousMessages", allMessages);

                console.log(`📩 Sent full message list to Admin UID: ${targetUID}`);

                const onlineList = Object.values(onlineUsers);
                io.to(userSockets[targetUID]).emit("onlineCheck", onlineList);
                console.log(`📡 Sent online list to admin ${userDetails.displayName}`);


            } else {
                console.log(`⚠️ Target Admin UID ${targetUID} not connected. Notification saved.`);
            }
            if (userSockets[managerUID]) {
                const mSnapshot = await db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("managers").doc(managerID).collection("notifications").get();
                const allMmessages = mSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                io.to(userSockets[managerUID]).emit("previousMessages", allMmessages);

                console.log(`📩 Sent full message list to Admin UID: ${managerUID}`);

                const onlineList = Object.values(onlineUsers);
                io.to(userSockets[managerUID]).emit("onlineCheck", onlineList);
                //io.to(userSockets[managerUID]).emit("CLockedInCount", presenceSnapshot.data());
                console.log(`📡 Sent online list to admin ${userDetails.displayName}`);
            };
        }
        socket.on("delete_notification", async (data) => {
            const { notificationId } = data;
            let notificationRef;
            try{
                if (socket.user.role === "admin") {                
                    console.log(`❌ Deleting notification with ID: ${notificationId}`);
                    // Remove the notification from the Firestore collection
                    notificationRef = db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("notifications").doc(notificationId);
                
                } else if (socket.user.role === "manager") {
                    notificationRef = db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("managers").doc(managerID).collection("notifications").doc(notificationId);;
                }
                
                await notificationRef.delete();
                console.log("✅ Notification deleted from Firestore.");
            } catch (error) {
                console.error("❌ Error deleting notification: ", error);
            }    
        });
        
        socket.on("delete_all_notifications", async () => {
            console.log(`❌ Deleting all notifications for UID: ${socket.user.uid}`);
            let notificationsRef;

            // Check the user's role and set the reference accordingly
            if (socket.user.role === "admin") {
                notificationsRef = db.collection("user2")
                    .doc("app_owner")
                    .collection("admin")
                    .doc(adminID)
                    .collection("notifications");
            } else if (socket.user.role === "manager") {
                notificationsRef = db.collection("user2")
                    .doc("app_owner")
                    .collection("admin")
                    .doc(adminID)
                    .collection("managers")  // Ensure this is the correct collection name
                    .doc(managerID)
                    .collection("notifications");
            }

            // If notificationsRef is still undefined, stop the operation
            if (!notificationsRef) {
                console.log("❌ Invalid role or missing user information.");
                return;
            }

            try {
                const snapshot = await notificationsRef.get();
                const batch = db.batch();

                // Delete each notification document
                snapshot.docs.forEach(doc => batch.delete(doc.ref));

                // Commit the batch delete
                await batch.commit();
                console.log("✅ All notifications deleted from Firestore.");
            } catch (error) {
                console.error("Error deleting notifications:", error);
            }
        });
        
        socket.on("employee_logged_out", async () => {
            console.log(`📤 Employee ${socket.user.displayName} logged out`);
            
            const messageData = {
                sender: socket.user.displayName,
                message: `${socket.user.displayName} just logged out!`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            };

            // Save notification under targetUID’s collection
            if (targetUID) {
                const targetRef = db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("notifications");
                await targetRef.add(messageData);
                
                if (managerUID) {
                    const managerRef = db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("managers").doc(managerID).collection("notifications");
                    await managerRef.add(messageData);
                    const managerDoc = await db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("managers").doc(managerID).get();

                    if (managerDoc.exists) {
                        const mPushToken = managerDoc.data().pushToken;
                        if (mPushToken) {
                            console.log("Retrieved Push Token:", mPushToken);
                            sendPushNotification(mPushToken, "Log Out Notifier", messageData.message); 
                        }                        
                    } else {
                        console.log("No such document!");
                    }
                    
                }
                
                if (userSockets[targetUID]) {                   
                const snapshot = await targetRef.get();
                const allMessages = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
        
                io.to(userSockets[targetUID]).emit("previousMessages", allMessages);
        
                console.log(`📩 Sent full message list to Admin UID: ${targetUID}`);
                } else {
                    console.log(`⚠️ Target Admin UID ${targetUID} not connected. Notification saved.`);
                }

                if (userSockets[managerUID]) {
                    const mSnapshot = await db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("managers").doc(managerID).collection("notifications").get();
                    const allMmessages = mSnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));

                    io.to(userSockets[managerUID]).emit("previousMessages", allMmessages);

                    console.log(`📩 Sent full message list to Admin UID: ${managerUID}`);
                }
            }
        });

        socket.on("clocking_status", async (data) => {
            const { message } = data;
            const messageData = {
                sender: socket.user.displayName,
                message: message,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            };
        
            // If the targetUID is defined, store the notification in the database
            if (targetUID) {
                try {
                    const targetRef = db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("notifications");
                    await targetRef.add({ message });
        
                    console.log(`Received clocking status from ${socket.user.displayName}: ${message}`);
                    
                    if (managerUID) {
                        const managerRef = db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("managers").doc(managerID).collection("notifications");
                        await managerRef.add(messageData);
                        const managerDoc = await db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("managers").doc(managerID).get();

                        if (managerDoc.exists) {
                            const mPushToken = managerDoc.data().pushToken;
                            if (mPushToken) {
                                console.log("Retrieved Push Token:", mPushToken);
                                sendPushNotification(mPushToken, "Employee Clock Notifier", messageData.message);
                            }
                        } else {
                            console.log("No such document!");
                        }
                        
                    }

                    if (userSockets[targetUID]) {                       
                        const snapshot = await targetRef.get();
                        const allMessages = snapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        }));
                        io.to(userSockets[targetUID]).emit("previousMessages", allMessages);
                
                        console.log(`📩 Sent full message list to Admin UID: ${targetUID}`);
                    } else {
                        console.log(`⚠️ User with UID ${targetUID} is not connected.`);
                    }

                    if (userSockets[managerUID]) {
                        const mSnapshot = await db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("managers").doc(managerID).collection("notifications").get();
                        const allMessages = mSnapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        }));
                        io.to(userSockets[managerUID]).emit("previousMessages", allMessages);

                        console.log(`📩 Sent full message list to Admin UID: ${targetUID}`);
                    } else {
                        console.log(`⚠️ User with UID ${targetUID} is not connected.`);
                    }
                } catch (error) {
                    console.error("❌ Error saving notification to database:", error);
                }
            }
        });
        
        socket.on("user_location", async (data) => {
            const { latitude, longitude, timestamp } = data;
            const displayName = socket.user.displayName;

            const ts = timestamp ? new Date(timestamp) : new Date();
            const dateKey = ts.toISOString().split("T")[0];
            const date = admin.firestore.Timestamp.now();

            if (targetUID) {
                try {
                    const locationPoint = {
                        latitude,
                        longitude,
                        timestamp: ts.toISOString(),
                    };

                    const timelineDocRef = db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("locations").doc(`${dateKey}-${displayName}`);
                    const timelineDoc = await timelineDocRef.get();

                    if (timelineDoc.exists) {
                        await timelineDocRef.update({
                            coordinates: admin.firestore.FieldValue.arrayUnion(locationPoint),
                            lastUpdated: ts.toISOString()
                        });
                    } else {
                        await timelineDocRef.set({
                            date: date,
                            sender: displayName,
                            coordinates: [locationPoint],
                            createdAt: ts.toISOString(),
                            lastUpdated: ts.toISOString()
                        });
                    }

                    if (userSockets[targetUID]) {
                        const latestSnapshot = await timelineDocRef.get();
                        const locationData = latestSnapshot.data();
                        io.to(userSockets[targetUID]).emit("user_location", {
                            user: displayName,
                            date: dateKey,
                            locations: locationData.coordinates,
                        });

                        console.log(`📩 Sent updated locations to Admin UID: ${targetUID}`);
                    } else {
                        console.log(`⚠️ Admin with UID ${targetUID} is not connected.`);
                    }

                    if (managerUID) {
                        try {
                            const mTimelineDocRef = db.collection("user2").doc("app_owner").collection("admin").doc(adminID).collection("managers").doc(managerID).collection("locations").doc(`${dateKey}-${displayName}`);
                            const mTimelineDoc = await mTimelineDocRef.get(); 

                            if (mTimelineDoc.exists) {
                                await mTimelineDocRef.update({
                                    coordinates: admin.firestore.FieldValue.arrayUnion(locationPoint),
                                    lastUpdated: ts.toISOString()
                                });
                            } else {
                                await mTimelineDocRef.set({
                                    date: date,
                                    sender: displayName,
                                    coordinates: [locationPoint],
                                    createdAt: ts.toISOString(),
                                    lastUpdated: ts.toISOString()
                                });
                            }

                            console.log(`📍 Stored location for ${displayName} on ${dateKey}`);                   

                        if (userSockets[managerUID]) {
                            const mLatestSnapshot = await mTimelineDocRef.get();
                            const mLocationData = mLatestSnapshot.data();

                            io.to(userSockets[managerUID]).emit("user_location", {
                                user: displayName,
                                date: dateKey,
                                locations: mLocationData.coordinates,
                            });

                            console.log(`📩 Sent updated locations to nanager UID: ${managerUID}`);
                        } else { 
                            console.log(`⚠️ Mana ger with UID ${managerUID} is not connected.`); 
                        }

                } catch (error) {
                    console.error("❌ Error handling manager timeline update:", error);
                }
                    }

                } catch (error) {
                    console.error("❌ Error handling daily timeline update:", error); 
                }
            }
        });


        socket.on("disconnect", () => {
            if (socket.user) {
                const uid = socket.user.uid;
                console.log(`🔴 Disconnected: ${socket.user.displayName} (${uid})`);

                // Clean up memory
                delete userSockets[uid];
                delete onlineUsers[uid];
                socket.user = null;

                onlineList = Object.values(onlineUsers); 
                // Send updated list to admin if online
                // if (userSockets[targetUID]) {                    
                //     io.to(userSockets[targetUID]).emit("onlineCheck", updatedOnlineList);
                //     console.log(`📡 Updated online list sent to admin UID: ${socket.targetUID}`);
                // }
                // if (userSockets[managerUID]) {
                //     io.to(userSockets[managerUID]).emit("onlineCheck", updatedOnlineList);
                //     console.log(`📡 Updated online list sent to manager UID: ${socket.managerUID}`);
                // }
            }
        });


    } catch (error) {
        console.error("❌ Invalid token:", error);
        socket.disconnect();
    }
});



server.listen(PORT,'0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`); 
}); 
