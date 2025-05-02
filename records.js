const express = require('express');
const path = require('path');
const { admin, db, auth } = require("./firebase");
const router = express.Router();

async function clockInUser(userPath, fullName, address, comment) {
    try {
        // 🔍 Extract registrarId from userPath
        const registrarId = userPath.split("/")[3];
        const managerId = userPath.split("/")[5];
        const userId = userPath.split("/").at(-1);

        const userRef = db.doc(userPath);

        const userSnapshot = await userRef.get();
        const userData = userSnapshot.data();

        if (!userData) {
            console.error("❌ User data not found.");
            return;
        }       
        const department = userData.department || "unknown";
        
        const clockCollectionRef = db.doc(userPath).collection("clock");
        const lastEventRef = db.doc(userPath).collection("clock").doc("lastEvent");
        const lastClockingRef = db.doc(userPath).collection("clock").doc("lastClocking");

        // 🔍 Admin reference for storing employee clock-in data
        const adminDocRef = db.collection("user2")
                              .doc("app_owner")
                              .collection("admin")
                              .doc(registrarId)
                              .collection("employeeClock");
                              
        const managerDocRef = db.collection("user2")
                                .doc("app_owner")
                                .collection("admin")
                                .doc(registrarId)
                                .collection('managers')
                                .doc(managerId)
                                .collection("employeeClock");                      
        const now = admin.firestore.Timestamp.now();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // 🔍 Check if a clock-in document exists for today
        const todayClockQuery = await clockCollectionRef
            .where("clockInTime", ">=", admin.firestore.Timestamp.fromDate(todayStart))
            .limit(1)
            .get();

        if (!todayClockQuery.empty) {
            // ✅ Clock-out: Update existing document
            const clockDocRef = todayClockQuery.docs[0].ref;
            await clockDocRef.update({
                clockOutTime: now,
                clockOutLocation: address,
                clockOutComment: comment || "",
                status: "clocked out",
            });

            // 🔄 Overwrite lastEvent with clock-out details
            await lastEventRef.set({
                type: "clock_out",
                timestamp: now,
                location: address,
                comment: comment || "",
                status: "clocked out",
            });

            await lastClockingRef.set({
                lastClockInTime: todayClockQuery.docs[0].data().clockInTime,
                lastClockOutTime: now,
                lastClockOutLocation: address,
                lastClockOutComment: comment || ""
            });

            // ✅ Update admin record
            await adminDocRef.doc(todayClockQuery.docs[0].id).update({
                clockOutTime: now,
                clockOutLocation: address,
                clockOutComment: comment || "",
                status: "clocked out",
            });

            await managerDocRef.doc(todayClockQuery.docs[0].id).update({
                clockOutTime: now,
                clockOutLocation: address,
                clockOutComment: comment || "",
                status: "clocked out",
            });

            console.log(`✅ Clock-out recorded for ${fullName} at ${address}`);
            return { success: true, message: `Clock-out successful for ${fullName}`, emit: `${fullName} clocked Out at ${now.toDate()}` };
        } else {
            // ✅ Clock-in: Create a new document
            const clockInData = {
                clockInTime: now,
                clockInLocation: address,
                clockInComment: comment || "",
                clockOutTime: null,
                clockOutLocation: null,
                clockOutComment: null,
                status: "clocked in",
                name: fullName,
            };

            // Add clock-in document to `clockCollectionRef` and the admin's `employeeClock` subcollection
            const clockDocRef = await clockCollectionRef.add(clockInData);
            const clockId = clockDocRef.id; // Get the auto-generated document ID

            // 🔄 Overwrite lastEvent with clock-in details
            await lastEventRef.set({
                type: "clock_in",
                timestamp: now,
                location: address,
                comment: comment || "",
                status: "clocked in",
            });

            // 🔄 Overwrite lastClocking with latest clock-in (no clock-out yet)
            await lastClockingRef.set({
                lastClockInTime: now,
                lastClockInLocation: address,
                lastClockInComment: comment || "",
                lastClockOutTime: null,
                lastClockOutLocation: null,
                lastClockOutComment: null
            });

            // ✅ Add clock-in record to admin's `employeeClock` subcollection (using generated clockId)
            await adminDocRef.doc(clockId).set({
                clockInTime: now,
                clockInLocation: address,
                clockInComment: comment || "",
                clockOutTime: null,
                clockOutLocation: null,
                clockOutComment: null,
                name: fullName,
                department: department,
                id: userId,
                status: "clocked in",
            });

            await managerDocRef.doc(clockId).set({
                clockInTime: now,
                clockInLocation: address,
                clockInComment: comment || "",
                clockOutTime: null,
                clockOutLocation: null,
                clockOutComment: null,
                name: fullName,
                department: department,
                id: userId,
                status: "clocked in",
            });
            console.log(`✅ Clock-in recorded for ${fullName} at ${address}`);
            return { success: true, message: `Clock-in successful for ${fullName}`,  emit: `${fullName} clocked in at ${now.toDate()}` };
        }
    } catch (error) {
        console.error("❌ Error in clock-in process:", error);
        return { success: false, error: error.message };
    }
}

// 🔥 API Route for Clock-in
router.post("/clock-in", async (req, res) => {
    try {
        const { userPath, fullName, address, comment } = req.body;

        // ✅ Validate input
        if (!userPath || !address || !fullName) {
            return res.status(400).json({ success: false, error: "Missing required fields" });
        }

        // ✅ Call the function to log the clock-in
        const result = await clockInUser(userPath, fullName, address, comment);

        if (!result.success) {
            return res.status(500).json(result); // Send error response
        }

        res.json(result); // Send success response
    } catch (error) {
        console.error("❌ Server error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post("/get-last-clock-event", async (req, res) => {
    try {
        const { userPath } = req.body;
        
        if (!userPath) {
            return res.status(400).json({ success: false, error: "User path is required" });
        }

        // 🔍 Reference to lastEvent doc
        const lastEventRef = db.doc(userPath).collection("clock").doc("lastEvent");
        const lastEventDoc = await lastEventRef.get();

        if (!lastEventDoc.exists) {
            return res.json({ success: true, type: null, timestamp: null });
        }

        res.json({ success: true, ...lastEventDoc.data() });
    } catch (error) {
        console.error("❌ Error fetching last clock event:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post("/get-last-clocking", async (req, res) => {
    try {
        const { userPath } = req.body;
        
        if (!userPath) {
            return res.status(400).json({ success: false, error: "User path is required" });
        }

        // 🔍 Reference to lastEvent doc
        const lastClockingRef = db.doc(userPath).collection("clock").doc("lastClocking");
        const lastClockingDoc = await lastClockingRef.get();

        if (!lastClockingDoc.exists) {
            return res.json({ success: true, type: null, timestamp: null });
        }

        const data = lastClockingDoc.data();
        const lastClocking = {
            clockInTime: data.clockInTime?._seconds ? new Date(data.clockInTime._seconds * 1000).toISOString() : null,
            clockInLocation: data.clockInLocation || 'N/A',
            clockInComment: data.clockInComment || 'N/A',
            clockOutTime: data.clockOutTime?._seconds ? new Date(data.clockOutTime._seconds * 1000).toISOString() : null,
            clockOutLocation: data.clockOutLocation || "N/A",
            clockOutComment: data.clockOutComment || "N/A",
            status: data.status || "N/A"
        };

        res.json({
            lastClockInTime: data.lastClockInTime ? data.lastClockInTime.toDate() : null,
            lastClockOutTime: data.lastClockOutTime ? data.lastClockOutTime.toDate() : null,
        });

    } catch (error) {
        console.error("❌ Error fetching last clock event:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post("/get-clock-events", async (req, res) => {
    try {
        const { userID, limit } = req.body;

        // ✅ Validate input
        if (!userID) {
            return res.status(400).json({ success: false, error: "Missing userID" });
        }

        // 🔍 Reference to the admin collection for the specific user
        const adminClockRef = db.collection("user2")
            .doc("app_owner")
            .collection("admin")
            .doc(userID)
            .collection("employeeClock");

        // 🔄 Get the first 10 clock events for the user
        const clockEventsSnapshot = await adminClockRef.limit(limit || 10).get();

        if (clockEventsSnapshot.empty) {
            return res.status(404).json({ success: false, message: "No clock events found for this user" });
        }

        // ✅ Format the clock events data & include the doc ID
        const clockEvents = clockEventsSnapshot.docs.map(doc => ({
            id: doc.id,  // 🔹 Attach document ID
            ...doc.data() // 🔹 Include document data
        }));

        // 🔄 Send clock events to the frontend
        res.json({ success: true, clockEvents });

    } catch (error) {
        console.error("❌ Error fetching clock events:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});


router.post("/search-clock-events", async (req, res) => {
    const { userID, dateQuery, name } = req.body;
    let { startDate, endDate } = dateQuery || {};

    try {
        if (!userID) {
            return res.status(400).json({ success: false, error: "Missing userID" });
        }

        if (!startDate) {
            return res.status(400).json({ success: false, error: "Missing startDate" });
        }

        // 🔹 Ensure endDate is defined
        endDate = endDate || startDate;

        // 🔍 Convert dates to Firestore Timestamp format
        const dayStart = admin.firestore.Timestamp.fromDate(new Date(`${startDate}T00:00:00.000Z`));
        const dayEnd = admin.firestore.Timestamp.fromDate(new Date(`${endDate}T23:59:59.999Z`));

        const collectionRef = db
            .collection("user2")
            .doc("app_owner")
            .collection("admin")
            .doc(userID)
            .collection("employeeClock");

        // 🔄 Query filtering both Clock In & Clock Out timestamps
        let query = collectionRef
            .where("clockInTime", ">=", dayStart)
            .where("clockInTime", "<=", dayEnd);

        const snapshot = await query.get();

        if (snapshot.empty) {
            return res.json({ success: false, message: "No matching records found", clockEvents: [] });
        }

        let clockEvents = snapshot.docs.map(doc => ({
            ...doc.data(), 
        }));

        console.log("Retrieved clock events:", clockEvents);

        // 🔹 Debug: Check if `name` exists in the retrieved documents
        clockEvents.forEach(event => {
            console.log("Checking event document:", event);
            if (event.name) {
                console.log("Event Name:", event.name);
            } else {
                console.log("⚠️ No name field found in this event!");
            }
        });

        // 🔹 If a name is provided, filter the clock events by doc.id
        if (name) {
            console.log("Name sent",name);
            clockEvents = clockEvents.filter(event => 
                event.name && event.name.trim().toLowerCase() === name.trim().toLowerCase()
            );
            console.log("events", clockEvents);
        }

        res.json({ success: true, clockEvents });

    } catch (error) {
        console.error("❌ Error fetching filtered clock events:", error);
        res.json({ success: false, message: "Error fetching clock events" });
    }
});

router.post("/search-map-dates", async (req, res) => {
    const { id, dateQuery } = req.body;
    let { startDate, endDate } = dateQuery || {};

    try {
        if (!id) {
            return res.status(400).json({ success: false, error: "Missing userID" });
        }

        if (!startDate) {
            return res.status(400).json({ success: false, error: "Missing startDate" });
        }

        // Default endDate to startDate if not provided
        endDate = endDate || startDate;

        const startKey = new Date(startDate).toISOString().split("T")[0];
        const endKey = new Date(endDate).toISOString().split("T")[0];

        const timelineRef = db
            .collection("user2")
            .doc("app_owner")
            .collection("admin")
            .doc(id)
            .collection("locations")

        // Firestore query filtering by the `date` field
        const querySnap = await timelineRef.get();

        if (querySnap.empty) {
            return res.json({ success: false, message: "No timeline data in range", clockEvents: [] });
        }

        const results = [];

        querySnap.forEach(doc => {
            const timelineData = doc.data();
            const { sender, date, coordinates } = timelineData;

            if (coordinates && Array.isArray(coordinates)) {
                coordinates.forEach(entry => {
                    results.push({
                        displayName: sender,
                        ...entry,
                    });
                });
            }
        });

        return res.json({
            success: true,
            message: "Filtered timeline entries",
            mapSearhResults: results,
        });

    } catch (error) {
        console.error("❌ Error fetching filtered map events:", error);
        res.status(500).json({
            success: false,
            message: "Server error while fetching map events",
        });
    }
});


router.post("/get-sub-events", async (req, res) => {
    try {
        const { userID, role, supervisorID, id } = req.body;

        // ✅ Validate input
        if (!userID || !id) {
            return res.status(400).json({ success: false, error: "Missing required parameters" });
        }

        let empClockRef;

        if (role === "worker") {
            if (!supervisorID) {
                return res.status(400).json({ success: false, error: "Missing supervisorID for worker" });
            }
            empClockRef = db.collection("user2")
                .doc("app_owner")
                .collection("admin")
                .doc(userID)
                .collection("managers")
                .doc(supervisorID)
                .collection("workers")
                .doc(id)
                .collection("clock"); // ✅ Ensure collection name is a string
        } else if (role === "manager") {
            empClockRef = db.collection("user2")
                .doc("app_owner")
                .collection("admin")
                .doc(userID)
                .collection("managers")
                .doc(id)
                .collection("clock"); // ✅ Ensure collection name is a string
        } else {
            return res.status(400).json({ success: false, error: "Invalid role" });
        }

        // 🔄 Fetch first 10 clock events
        const clockEventsSnapshot = await empClockRef.limit(10).get();

        if (clockEventsSnapshot.empty) {
            return res.json({ success: false, message: "No clock events found for this user", clockEvents: [] });
        }

        // ✅ Format & send response
        const clockEvents = clockEventsSnapshot.docs
        .map(doc => ({
            id: doc.id,
            ...doc.data()
        }))
        .filter(event => event.id !== "lastClocking" && event.id !== "lastEvent"); // 🔥 Filter out unwanted events

        res.json({ success: true, clockEvents });


    } catch (error) {
        console.error("❌ Error fetching clock events:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/set-mapCoords', async (req, res) => {
    const { adminID, latitude, longitude } = req.body;

    if (!adminID || !latitude || !longitude) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const adminRef = db.collection("user2")
            .doc("app_owner")
            .collection("admin")
            .doc(adminID);

        // Save the coordinates, using merge: true to not overwrite other fields
        const coords = {
            latitude: latitude,
            longitude: longitude
        };

        // Save the coordinates object, using merge: true to not overwrite other fields
        await adminRef.set({
            coordinates: coords  // Storing as a single object
        }, { merge: true });

        res.status(200).json({ message: 'Coordinates saved successfully' });
    } catch (error) {
        console.error('Error saving coordinates:', error);
        res.status(500).json({ error: 'Failed to save coordinates' });
    }
});

router.post('/retrieve-mapCoords', async (req, res) => {
    const { adminID } = req.body;

    if (!adminID) {
        return res.status(400).json({ error: 'Missing adminID' });
    }

    try {
        const adminRef = db.collection("user2")
            .doc("app_owner")
            .collection("admin")
            .doc(adminID);

        // Fetch the document from Firestore
        const doc = await adminRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Admin not found' });
        }

        // Get the coordinates field
        const coordinates = doc.data().coordinates;

        if (!coordinates) {
            return res.status(404).json({ error: 'Coordinates not found for this admin' });
        }

        // Send the coordinates back in the response
        res.status(200).json({ coordinates: coordinates });
    } catch (error) {
        console.error('Error retrieving coordinates:', error);
        res.status(500).json({ error: 'Failed to retrieve coordinates' });
    }
});

router.post("/get-self-clock-events", async (req, res) => {
   const { userPath, dateQuery, name } = req.body;
       let { startDate, endDate } = dateQuery || {};
       
       try {
           if (!userPath) {
               return res.status(400).json({ success: false, error: "Missing userID" });
           }
   
           const docRef = db.doc(userPath).collection("clock");
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
   
           res.json({ success: true, clockEvents });
   
       } catch (error) {
           console.error("❌ Error fetching filtered clock events:", error);
           res.json({ success: false, message: "Error fetching clock events" });
       }
});

module.exports = router;