const firebaseConfig = {
    apiKey: "AIzaSyAeOIg82jbmV0pNamZRT_hkz4ekXawDqgc",
    authDomain: "employee-tracker-2.firebaseapp.com",
    projectId: "employee-tracker-2",
    storageBucket: "employee-tracker-2.firebasestorage.app",
    messagingSenderId: "567769082501",
    appId: "1:567769082501:web:f87f7ea693aab6856217ec"
};

firebase.initializeApp(firebaseConfig);

if (typeof firebase === "undefined") {
    console.error("Firebase SDK not loaded");
}

const continueUrl = "https://employee-tracker-l6iz.onrender.com/password_reset";

document.getElementById("submitPassword").addEventListener("click", () => {
    const userEmail = document.getElementById("email").value.trim();
    firebase.auth().sendPasswordResetEmail(userEmail, {
        url: continueUrl
    }).then(() => {
        alert("Password reset email sent!");
        document.getElementById("email").value = '';
    }).catch((error) => {
        console.error("Error sending password reset email:", error.message);
    });    
})

