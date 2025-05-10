const firebaseConfig = {
    apiKey: "AIzaSyAeOIg82jbmV0pNamZRT_hkz4ekXawDqgc",
    authDomain: "employee-tracker-2.firebaseapp.com",
    projectId: "employee-tracker-2",
    storageBucket: "employee-tracker-2.firebasestorage.app",
    messagingSenderId: "567769082501",
    appId: "1:567769082501:web:f87f7ea693aab6856217ec"
};

firebase.initializeApp(firebaseConfig);

document.getElementById("submitReset").addEventListener("click", () => {


    const params = new URLSearchParams(window.location.search);
    const oobCode = params.get("oobCode");
    const newPassword = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        alert("the passwords are mismatched");
        return;
    }

    firebase.auth().verifyPasswordResetCode(oobCode)
        .then(email => {
            return firebase.auth().confirmPasswordReset(oobCode, newPassword).then(() => email);
        })
        .then(email => {
            return firebase.auth().signInWithEmailAndPassword(email, newPassword);
        })
        .then(async userCredential => {
            const user = userCredential.user;

            // Refresh token to ensure claims are up-to-date
            await user.getIdToken(true);
            const idTokenResult = await user.getIdTokenResult();

            const claims = idTokenResult.claims;
            const role = claims.role;
            const userPath = claims.userPath; // e.g., "users/uid" or similar

            if (role === "admin" ) {
                alert("Password reset successful.");
                window.location.href = "/";
                return;
            }

            if (role === "app owner") {
                alert("Password reset successful.");
                document.getElementById('password').value = '';
                document.getElementById('confirmPassword').value = '';
                return;
            }

            // Non-admin user – send path and password to backend
            const response = await fetch("/phone_login/password-change", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${idTokenResult.token}`
                },
                body: JSON.stringify({
                    userPath: userPath,
                    newPassword: newPassword
                })
            });

            if (!response.ok) throw new Error("Failed to update password in backend.");

            alert("Password reset successful.");
            document.getElementById('password').value = '';
            document.getElementById('confirmPassword').value = '';
            
        })
        .catch(error => {
            console.error("Error during reset flow:", error.message);
            alert("Password reset failed: " + error.message);
        });
    
})

