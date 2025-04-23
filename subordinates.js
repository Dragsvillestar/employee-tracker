const express = require("express");
const router = express.Router();
const { db, auth } = require("./firebase");
 
router.post("/", async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, error: "Missing user ID" });
        }

        console.log("📌 Fetching All Employees (Managers & Workers) for:", userId);

        // 🔍 Get Admin Details
        const adminRef = db.collection("user2").doc("app_owner").collection("admin").doc(userId);
        const adminDoc = await adminRef.get();

        if (!adminDoc.exists) {
            return res.status(404).json({ success: false, error: "Admin not found" });
        }

        // 🔍 Get All Managers Under This Admin
        const managersRef = adminRef.collection("managers");
        const managersSnapshot = await managersRef.get();

        const employees = [];  // ✅ Combined list for managers & employees

        for (const doc of managersSnapshot.docs) {
            const managerData = doc.data();
            const managerId = doc.id;

            // ✅ Add Manager to Employees Array
            employees.push({
                id: managerId,
                fullName: `${managerData.firstName} ${managerData.lastName}`,
                firstName: managerData.firstName,
                lastName: managerData.lastName,
                email: managerData.email,
                phoneNumber: managerData.phoneNumber,
                department: managerData.department,
                gender: managerData.gender,
                role: managerData.role  // 🔹 This will indicate "Manager"
            });

            console.log(`👨‍💼 Fetching employees for Manager: ${managerData.firstName} ${managerData.lastName}`);

            // 🔍 Get Employees Under Each Manager
            const workersRef = managersRef.doc(managerId).collection("workers");
            const workersSnapshot = await workersRef.get();

            workersSnapshot.forEach(workerDoc => {
                const workerData = workerDoc.data();
                
                // ✅ Add Worker to Employees Array
                employees.push({
                    id: workerDoc.id,
                    fullName: `${workerData.firstName} ${workerData.lastName}`,
                    firstName: workerData.firstName,
                    lastName: workerData.lastName,
                    email: workerData.email,
                    phoneNumber: workerData.phoneNumber,
                    department: workerData.department,
                    gender: workerData.gender,
                    role: workerData.role,
                    supervisingManagerId : workerData.supervisingManagerID  // 🔹 This will indicate "Employee"
                });
            });
        }

        console.log("✅ Retrieved All Employees (Managers & Workers)");

        return res.json({
            success: true,
            employees: employees  // ✅ Single list with roles differentiating managers & workers
        });

    } catch (error) {
        console.error("❌ Error fetching data:", error);
        return res.status(500).json({ success: false, error: "Server error" });
    }
});

router.post("/get-clock-events", async (req, res) => {
    try {
        const { userPath, limit } = req.body;

        // ✅ Validate input
        if (!userPath) {
            return res.status(400).json({ success: false, error: "Missing userPath" });
        }

        // 🔍 Reference to the specific user's clock collection
        const docRef = db.doc(userPath).collection("clock");

        // ✅ Apply the limit to the query, use the provided limit or default to 10
        const docSnapshot = await docRef.limit(limit || 10).get();

        // Check if the query returned any documents
        if (docSnapshot.empty) {
            return res.status(404).json({ success: false, error: 'No clock events found' });
        }

        const excludedIds = ['lastClocking', 'lastEvent'];
        // ✅ Format the clock events data & include the doc ID
        const clockEvents = docSnapshot.docs
            .map(doc => ({
                id: doc.id,  // 🔹 Attach document ID
                ...doc.data() // 🔹 Include document data
            }))
            .filter(event => !excludedIds.includes(event.id)); 

        // ✅ Send the response with the clock events
        res.json({ success: true, clockEvents });

    } catch (error) {
        console.error("❌ Error fetching clock events:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete("/delete", async (req, res) => {
    try {
        const { userID, role, registrarId, supervisingManagerID, email } = req.body;

        if (!userID || !role || !registrarId) {
            return res.status(400).json({ error: "Missing userID, role, or registrarId in request." });
        }

        console.log(`🗑️ Deleting ${role} with UID: ${userID}`);

        let userDocRef;

        if (role === "manager") {
            userDocRef = db.collection("user2")
                           .doc("app_owner")
                           .collection("admin")
                           .doc(registrarId)
                           .collection("managers")
                           .doc(userID);
        } 
        else if (role === "worker") {
            if (!supervisingManagerID) {
                return res.status(400).json({ error: "Worker deletion requires supervising manager ID." });
            }
            userDocRef = db.collection("user2")
                           .doc("app_owner")
                           .collection("admin")
                           .doc(registrarId)
                           .collection("managers")
                           .doc(supervisingManagerID)
                           .collection("workers")
                           .doc(userID);
        } 
        else {
            return res.status(400).json({ error: "Invalid role specified." });
        }

        await userDocRef.delete(); const userRecord = await auth.getUserByEmail(email);
        const userUID = userRecord.uid;

        // Now delete the user from Firebase Authentication
        await auth.deleteUser(userUID);
        console.log(`✅ User ${userID} deleted from Firebase Authentication`);
        console.log(`✅ User ${userID} deleted successfully`);

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
        return res.status(200).json({ success: true, message: "User deleted and employee count updated." });

    } catch (error) {
        console.error("❌ Deletion error:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

module.exports = router;
