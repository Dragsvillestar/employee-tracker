const express = require('express');
const bcrypt = require("bcrypt");
const path = require('path');
const { db, auth, admin } = require("./firebase");
const router = express.Router();

const generateUID = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase(); // 6-character UID
};

const formatPhoneNumber = (phone) => {
    if (phone.startsWith("0")) {
        return "+234" + phone.slice(1); // Convert 081... to +23481...
    }
    return phone; // If already in E.164 format, keep it
};

router.post("/register", async (req, res) => {
    try {
        const { 
            creatorID, firstName, lastName, gender, password, phoneNumber, email, department, role , supervisingManagerID 
        } = req.body;

        if (!creatorID || !firstName || !lastName || !phoneNumber || !role || !email || !password ) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        console.log("📌 Received Data:", req.body);

        // 🔍 Fetch Admin Document
        const adminRef = db.collection("user2").doc("app_owner").collection("admin").doc(creatorID);
        const adminDoc = await adminRef.get();

        if (!adminDoc.exists) {
            return res.status(404).json({ error: "Admin not found" });
        }

        const adminData = adminDoc.data();        
        const adminUid =adminData.uid;
        const maxEmployees = adminData.number || 0;  // Maximum employees allowed
        const currentEmployeeCount = adminData.employeeCount || 0;  // Current employee count

        if (currentEmployeeCount >= maxEmployees) {
            return res.status(403).json({ error: "⚠️ Employee limit reached! Upgrade your plan to add more employees." });
        }

        const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
        const customUid = generateUID();  

        // 🔥 Create a New User in Firebase Authentication
        const newUser = await auth.createUser({
            email: email,
            password: password, // Store securely
            displayName: `${firstName} ${lastName}`,
            phoneNumber: formattedPhoneNumber || null
        });

        const hashedPassword = await bcrypt.hash(password, 10);

        console.log(`✅ Firebase Auth User Created: ${newUser.uid}`);

        let userPath;
        let userData = {
            uid: newUser.uid,
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`,
            gender: gender || "N/A",
            phoneNumber: formattedPhoneNumber,
            email,
            department,
            passwordHash: hashedPassword,
            role,
            registeredAt: new Date()
        };

        let registrar;

        if (role === "manager") {
            userPath = adminRef.collection("managers").doc(customUid);
            registrar = creatorID;

            await auth.setCustomUserClaims(newUser.uid, { role: "manager", adminUid: adminUid, userPath: userPath.path, registrar: registrar });
            console.log(`🔹 Manager registered with UID: ${newUser.uid}, Admin UID: ${adminUid}`);
        } else if (role === "worker") {
            if (!supervisingManagerID) {
                await auth.deleteUser(newUser.uid);
                return res.status(400).json({ error: "Worker must have a Supervising Manager ID." });
            }

            // 🔍 Verify that the manager exists
            const managerRef = adminRef.collection("managers").doc(supervisingManagerID);
            const managerDoc = await managerRef.get();
            

            if (!managerDoc.exists) {
                await auth.deleteUser(newUser.uid);
                return res.status(404).json({ error: "Supervising Manager not found." });
            }

            const managerData = managerDoc.data();
            const managerUid = managerData.uid;
            userPath = managerRef.collection("workers").doc(customUid);
            userData.supervisingManagerID = supervisingManagerID;
            registrar = supervisingManagerID

            await auth.setCustomUserClaims(newUser.uid, { role: "worker", adminUid: adminUid, managerUid: managerUid, userPath: userPath.path, registrar: registrar });
            console.log(`🔹 Worker registered with UID: ${newUser.uid}, Manager UID: ${managerUid}`);
        } else {
            await auth.deleteUser(newUser.uid);
            return res.status(400).json({ error: "Invalid role specified." });
        }

        // 🔥 Save User Data in Firestore
        await userPath.set(userData);
        console.log(`✅ ${role.charAt(0).toUpperCase() + role.slice(1)} registered with UID: ${newUser.uid}`);

        // 🔥 Increment Employee Count
        await adminRef.update({ employeeCount: currentEmployeeCount + 1 });
        console.log("📌 Employee count updated:", currentEmployeeCount + 1);

        return res.status(201).json({ success: true, userID: newUser.uid }); 

    } catch (error) {
        console.error("❌ Registration error:", error.message);
        if (error.message.includes("Firestore")) {
            await auth.deleteUser(newUser.uid);
        }
        return res.status(400).json({ success: false, error: error.message });
    }
});


router.get('/home', (req, res) => {
    const username = req.query.username || "Guest"; 
    res.render("manager-welcome.pug", { username }); 
});
/*router.post("/user-profile", async (req, res) => {
    try {
        const { userID, role, registrarId, supervisingManagerID } = req.body;

        if (!userID || !role || !registrarId) {
            return res.status(400).json({ error: "Missing userID, role, or registrarId in request." });
        }

        console.log(`🔍 Searching profile for ${role} with UID: ${userID}`);

        let userDocRef;

        if (role === "manager") {
            // 📂 Managers: `user2/app_owner/admin/{registrarId}/managers/{userID}`
            userDocRef = db.collection("user2")
                           .doc("app_owner")
                           .collection("admin")
                           .doc(registrarId)  // 🔹 Correct placement
                           .collection("managers")
                           .doc(userID);
        } 
        else if (role === "worker") {
            if (!supervisingManagerID) {
                return res.status(400).json({ error: "Worker profile missing supervising manager ID." });
            }

            // 📂 Workers: `user2/app_owner/admin/{registrarId}/managers/{supervisingManagerID}/workers/{userID}`
            userDocRef = db.collection("user2")
                           .doc("app_owner")
                           .collection("admin")
                           .doc(registrarId)  // 🔹 Correct placement
                           .collection("managers")
                           .doc(supervisingManagerID)
                           .collection("workers")
                           .doc(userID);
        } 
        else {
            return res.status(400).json({ error: "Invalid role specified." });
        }

        // 🔍 Fetch User Data
        const userDoc = await userDocRef.get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: "User profile not found." });
        }

        return res.status(200).json({ success: true, userData: userDoc.data() });

    } catch (error) {
        console.error("❌ Profile retrieval error:", error.message);
        return res.status(500).json({ error: error.message });
    }
});*/

router.post('/profile', async (req, res) => {
    try {
        const { userPath } = req.body;
        console.log("UserPath:",userPath);
        console.log("Fetching profile");
        if (!userPath) {
            return res.status(400).json({ error: 'userPath is required' });
        }
       
        // Query Firestore to retrieve the document using userPath
        const docRef = db.doc(userPath); // Using `db` for Firestore query
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userData = docSnapshot.data();
        const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`;
        const userId = docSnapshot.id;
        // Send the user data back to the frontend
        res.json({
            displayName:  fullName.trim() || "N/A",
            email: userData.email,
            phoneNumber: userData.phoneNumber,
            gender: userData.gender,
            id: userId,
            role: userData.role,
        });
    } catch (error) {
        console.error("Error fetching profile data:", error);
        res.status(500).json({ error: 'Failed to fetch profile data' });
    }
});

router.post('/subordinates', async (req, res) => {
    try {
        const { userPath } = req.body;
        console.log(userPath);

        if (!userPath) {
            return res.status(400).json({ error: 'userPath is required' });
        }

        // Query Firestore to retrieve the manager document using userPath
        const docRef = db.doc(userPath); // Using `db` for Firestore query
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Now fetch workers from the `workerSub` subcollection
        const subordinatesRef = docRef.collection('workers');
        const subordinatesSnapshot = await subordinatesRef.get();
        
        // Store worker information in an array (like employees array)
        const employees = [];
        subordinatesSnapshot.forEach(doc => {
            const workerData = doc.data();
            const workerId = doc.id;
            employees.push({
                id: workerId,
                fullName: `${workerData.firstName} ${workerData.lastName}`, // Concatenated fullName
                firstName: workerData.firstName,
                lastName: workerData.lastName,
                email: workerData.email,
                phoneNumber: workerData.phoneNumber,
                department: workerData.department,
                gender: workerData.gender,
                role: workerData.role
            });
        });

        // If no workers were found, return a 404
        if (employees.length === 0) {
            return res.status(404).json({ error: 'No workers found for this manager' });
        }

        // Send workers' information back to the frontend
        res.json({
            employees: employees // Send the employees array as the response
        });
    } catch (error) {
        console.error("Error fetching workers data:", error);
        res.status(500).json({ error: 'Failed to fetch workers data' });
    }
});

router.post('/subordinates/profile', async (req, res) => {
    try {
        const { userPath } = req.body;
        console.log("Requested worker path:", userPath);

        if (!userPath) {
            return res.status(400).json({ error: 'userPath is required' });
        }

        // Query Firestore to retrieve the worker document using userPath
        const docRef = db.doc(userPath);
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
            return res.status(404).json({ error: 'Worker not found' });
        }

        // Extract worker data
        const workerData = docSnapshot.data();
        const fullName = `${workerData.firstName || ''} ${workerData.lastName || ''}`.trim();

        // Send worker profile data to frontend
        res.json({
            id: docSnapshot.id,
            fullName: fullName || "N/A",
            firstName: workerData.firstName,
            lastName: workerData.lastName,
            email: workerData.email,
            phoneNumber: workerData.phoneNumber,
            department: workerData.department,
            gender: workerData.gender,
            role: workerData.role
        });
    } catch (error) {
        console.error("Error fetching worker profile:", error);
        res.status(500).json({ error: 'Failed to fetch worker profile' });
    }
});

router.post('/subordinates/delete', async (req, res) => {
    try {
        const { userPath } = req.body;  // Get userPath from the request body
        console.log("Requested worker path:", userPath);

        if (!userPath) {
            return res.status(400).json({ error: 'userPath is required' });
        }

        // Query Firestore to retrieve the worker document using userPath
        const docRef = db.doc(userPath);
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
            return res.status(404).json({ error: 'Worker not found' });
        }

        const workerData = docSnapshot.data();
        const email = workerData.email;  // Get email from the worker's data

        if (!email) {
            return res.status(400).json({ error: 'Email not found for the worker' });
        }

        // Delete user from Firebase Authentication
        await auth.getUserByEmail(email)
            .then(async (userRecord) => {
                // Delete the user from Firebase Authentication
                await auth.deleteUser(userRecord.uid);
                console.log(`Deleted user ${email} from Firebase Authentication.`);
            })
            .catch((error) => {
                console.error(`Error fetching user ${email} from Firebase Authentication:`, error);
                return res.status(500).json({ error: 'Failed to delete user from Firebase Authentication' });
            });

        // Now delete the worker document from Firestore
        await docRef.delete();
        console.log(`Deleted worker profile from Firestore: ${userPath}`);
        
        const registrarId = userPath.split("/")[3];

        const adminDocRef = db.collection("user2")
                              .doc("app_owner")
                              .collection("admin")
                              .doc(registrarId);

        // 📉 Decrement `employeeCount`
        await db.runTransaction(async (transaction) => {
            const adminDoc = await transaction.get(adminDocRef);
            if (!adminDoc.exists) {
                console.warn("⚠️ Admin document not found, skipping employee count update.");
                return;
            }

            const currentCount = adminDoc.data().employeeCount || 0;
            const newCount = Math.max(currentCount - 1, 0);

            console.log(`📉 Updating employeeCount: ${currentCount} → ${newCount}`);
            transaction.update(adminDocRef, { employeeCount: newCount });
        });

        console.log("📌 Employee count decremented by 1");
        res.json({
            message: 'Worker profile and authentication user deleted successfully',
            userPath: userPath
        });
    } catch (error) {
        console.error("Error deleting worker profile:", error);
        res.status(500).json({ error: 'Failed to delete worker profile' });
    }
});

router.post("/search-clock-events", async (req, res) => {
    const { userPath, dateQuery, name } = req.body;
    let { startDate, endDate } = dateQuery || {};
    
    try {
        if (!userPath) {
            return res.status(400).json({ success: false, error: "Missing userID" });
        }

        const docRef = db.doc(userPath).collection("employeeClock");
        let query;

        if (startDate) {
            // 🔍 Convert dates to Firestore Timestamp
            endDate = endDate || startDate;
            console.log("Start Date:", startDate, "End Date:", endDate)
            const dayStart = admin.firestore.Timestamp.fromDate(new Date(`${startDate}T00:00:00.000Z`));
            const dayEnd = admin.firestore.Timestamp.fromDate(new Date(`${endDate}T23:59:59.999Z`));

            query = docRef
                .where("clockInTime", ">=", dayStart)
                .where("clockInTime", "<=", dayEnd);
        } else {
            // 🔹 No date range: Fetch latest 10 events
            query = docRef.orderBy("clockInTime", "desc").limit(10);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            return res.json({ success: false, message: "No matching records found", clockEvents: [] });
        }

        let clockEvents = snapshot.docs.map(doc => ({ ...doc.data() }));

        // 🔎 Optional name filter
        if (name) {
            clockEvents = clockEvents.filter(event =>
                event.name && event.name.trim().toLowerCase() === name.trim().toLowerCase()
            );
        }

        res.json({ success: true, clockEvents });

    } catch (error) {
        console.error("❌ Error fetching filtered clock events:", error);
        res.json({ success: false, message: "Error fetching clock events" });
    }
});

router.post("/get-clock-events", async (req, res) => {
    const { userPath } = req.body;

    try {
        if (!userPath) {
            return res.status(400).json({ success: false, error: "Missing userID" });
        }

        // Get the start of today (midnight)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0); // Set to the beginning of today

        // Convert to Firestore Timestamp using admin.firestore.Timestamp
        const todayStartTimestamp = admin.firestore.Timestamp.fromDate(todayStart);

        const docRef = admin.firestore().doc(userPath).collection("employeeClock");

        // Filter clock events by today's date using `where`
        let query = docRef.where("clockInTime", ">=", todayStartTimestamp);

        const snapshot = await query.get();

        if (snapshot.empty) {
            return res.json({ success: false, message: "No matching records found", clockEvents: [] });
        }

        let clockEvents = snapshot.docs.map(doc => ({ ...doc.data() })); 

        res.json({ success: true, clockEvents });

    } catch (error) {
        console.error("❌ Error fetching filtered clock events:", error);
        res.json({ success: false, message: "Error fetching clock events" });
    }
});

module.exports = router;
