const express = require('express');
const bcrypt = require("bcrypt");
const { db, auth, admin } = require("./firebase");
const router = express.Router();

router.post("/", async (req, res) => {
    const { phoneNumber, password } = req.body;

    try {
        // 1. Get Firebase Auth user by phone number
        const firebaseUser = await admin.auth().getUserByPhoneNumber(phoneNumber);

        // 2. Get custom claims (should contain userPath)
        const claims = firebaseUser.customClaims;
        if (!claims || !claims.userPath) {
            return res.status(403).json({ error: "User path not found in claims." });
        }
        console.log("Phone user claims:", claims);
        // 3. Fetch user document from Firestore using the userPath
        const userDocRef = admin.firestore().doc(claims.userPath);
        const userSnapshot = await userDocRef.get();

        if (!userSnapshot.exists) {
            return res.status(404).json({ error: "User data not found." });
        }

        const user = userSnapshot.data();
        console.log("phone user:", user);

        // 4. Compare password with stored hash
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) {
            return res.status(401).json({ error: "Incorrect password." });
        }

        // 5. Generate custom token
        const token = await admin.auth().createCustomToken(firebaseUser.uid);

        // 6. Respond to frontend
        return res.json({
            "token": token
        });

    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
});

router.post('/password-change', async (req, res) => {
    const { userPath, newPassword } = req.body;

    if (!userPath || !newPassword) {
        return res.status(400).json({ error: "Missing userPath or newPassword" });
    }

    try {
        const userRef = db.doc(userPath);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            return res.status(404).json({ error: "User not found at provided path" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await userRef.update({
            passwordHash: hashedPassword,
            passwordUpdatedAt: new Date(),
        });

        return res.status(200).json({ success:true , message: "✅ Password updated successfully" });

    } catch (error) {
        console.error("Password change error:", error);
        return res.status(500).json({ success: false, error: "Server error while changing password" });
    }
});


module.exports = router;