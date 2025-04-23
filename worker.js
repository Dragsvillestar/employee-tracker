const express = require('express');
const path = require('path');
const { db, auth } = require("./firebase");
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

router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'indexw1.html'));
});

router.get('/home', (req, res) => {
    const username = req.query.username || "Guest";
    res.render("worker-welcome.pug", { username });
});



module.exports = router;