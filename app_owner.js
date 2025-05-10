const express = require('express');
const path = require('path');
const { admin, db, auth } = require("./firebase");
const router = express.Router();

router.post("/registered_companies", async (req, res) => {
    try {
        const { userPath } = req.body;

        if (!userPath) {
            return res.status(400).json({ success: false, error: "Missing required field" });
        }

        const docRef = db.doc(userPath).collection("admin");
        const docSnapshot = await docRef.get();

        if (docSnapshot.empty) {
            return res.status(404).json({ success: false, error: 'No Registered Companies yet' });
        }

        // Convert documents to plain data
        const companies = docSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return res.status(200).json({ success: true, companies: companies });

    } catch (error) {
        console.error("❌ Server error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post("/rates", async (req, res) => {
    try {
        const { userPath } = req.body;

        if (!userPath) {
            return res.status(400).json({ success: false, error: "Missing required field" });
        }

        const docRef = db.doc(userPath)
        const docSnapshot = await docRef.get();

        const data = docSnapshot.data(); // { silver: 199, gold: 499, ... }

        // Send only needed fields
        return res.status(200).json({
            success: true,
            plans: {
                silver: data.silver,
                gold: data.gold,
                platinum: data.platinum,
                diamond: data.diamond
            }
        })
    

    } catch (error) {
        console.error("❌ Server error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post("/rates_change", async (req, res) => {
    try {
        const { userPath, plan, amount } = req.body;

        if (!userPath || !plan || !amount) {
            return res.status(400).json({ success: false, error: "Missing required fields" });
        }

        const docRef = db.doc(userPath)
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
            return res.status(404).json({ success: false, error: "User document not found" });
        }

        await docRef.update({
            [plan]: amount // Dynamically update the plan field
        });

        // Send success response
        return res.status(200).json({
            success: true,
            message: `${plan} plan updated to ${amount}`
        });



    } catch (error) {
        console.error("❌ Server error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post("/push_token_save", async (req, res) => {
    try {
        const { userPath, pushToken } = req.body;

        if (!userPath || !pushToken) {
            return res.status(400).json({ success: false, error: "Missing required fields" });
        }

        const docRef = db.doc(userPath)
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
            await docRef.set({
                pushToken: pushToken 
            });
            return res.status(200).json({
                success: true,
                message: "Push token saved (new user)"
            });
        } else {
            await docRef.update({
                pushToken: pushToken
            });
            return res.status(200).json({
                success: true,
                message: "Push token updated"
            });
        }

    } catch (error) {
        console.error("❌ Server error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post("/notifications", async (req, res) => {
    try {
        const { userPath } = req.body;

        if (!userPath) {
            return res.status(400).json({ success: false, error: "Missing required field" });
        }

        const notificationsRef = db.collection(userPath).doc("app_owner").collection("notifications");
        const notificationsSnapshot = await notificationsRef.get();

        if (notificationsSnapshot.empty) {
            return res.status(404).json({ success: false, error: 'No notifications found' });
        }

        // Convert documents to plain data
        const notifications = notificationsSnapshot.docs.map(doc => ({
            ...doc.data()
        }));

        return res.status(200).json({ success: true, notifications: notifications });

    } catch (error) {
        console.error("❌ Server error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});


module.exports = router;