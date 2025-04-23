const firebaseConfig = {
    apiKey: "AIzaSyAeOIg82jbmV0pNamZRT_hkz4ekXawDqgc",
    authDomain: "employee-tracker-2.firebaseapp.com",
    projectId: "employee-tracker-2",
    storageBucket: "employee-tracker-2.firebasestorage.app",
    messagingSenderId: "567769082501",
    appId: "1:567769082501:web:f87f7ea693aab6856217ec"
  };

let address;
let userId;
let userName;
let bodyHtml;
let user;
let socket; 

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else {
    firebase.app(); 
}

if (typeof firebase === "undefined") {
    console.error("❌ Firebase is not loaded. Make sure Firebase is included on this page.");
} else {
    console.log("✅ Firebase is loaded correctly.");
}
// Monitor auth state changes

function fetchAndDisplayProfile() {
    // Make the POST request to fetch user profile data
    fetch("/manager/profile", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            userPath: user.userPath // Use userData.userPath to fetch profile details
        })
    })
    .then(response => response.json())
    .then(profileData => {
        console.log("Profile Data:",profileData);        
        // Handle the case when profile data is returned
        document.getElementById("right-side").innerHTML = `
            <div class = "p-5">
            <h2 class = 'pageTopic'> Profile</h2>
            <p><strong>Name:</strong> ${profileData.displayName || "N/A"}</p>
            <p><strong>Email:</strong> ${profileData.email || "N/A"}</p>
            <p><strong>Phone Number:</strong> ${profileData.phoneNumber || "N/A"}</p>
            <p><strong>Gender:</strong> ${profileData.gender || "N/A"}</p>
            <p><strong>Role:</strong> ${profileData.role || "N/A"}</p>
            </div>
        `;
    })
    .catch(error => {
        console.error("❌ Error fetching profile:", error);
        document.getElementById("recentClocks").innerHTML = "<p>Failed to load profile data.</p>";
    });
}


async function logout() {
    try {
        if (socket) {
            socket.emit("employee_logged_out");
            console.log("📤 Sent employee_logged_out event to the server");
        }

        await firebase.auth().signOut();
        console.log("✅ Firebase user signed out");

        // Clear session storage
        sessionStorage.clear();
        console.log("✅ Session storage cleared");

        // Disconnect socket, ensure socket is nullified
        if (socket) {
            socket.disconnect();
            console.log("✅ Socket disconnected");
            socket = null; // Ensure socket is nullified after disconnect
        }

        // Expire cookies
        document.cookie = "firebaseIdToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        console.log("✅ Cookies expired");

        // Ensure all related data is removed from sessionStorage
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("userCreds");
        sessionStorage.removeItem(`isConnected_${user.uid}`);  // If applicable
        console.log("✅ All sessionStorage items removed");

        // Optionally, you can clear any global variables or other session-related data
        window.sessionStorage.clear(); // Clears all data in session storage.

        // Redirect to login page
        window.location.href = "/worker"; 
    } catch (error) {
        console.error("❌ Logout error:", error);
    }
}

let initialLocation = { latitude: null, longitude: null };

function initMapAndFetchLocation() {
    if (!navigator.geolocation) {
        console.error("❌ Geolocation is not supported by your browser.");
        return;
    }

    // ✅ Initialize Leaflet map
    const map = L.map("map", { attributionControl: false }).setView([0, 0], 2); // Default world view

    // ✅ Load OpenStreetMap tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "",
    }).addTo(map); // No attribution text

    // ✅ Get user's location
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            initialLocation = { latitude, longitude };
            // Update map to user's location
            map.setView([latitude, longitude], 13);

            // Add marker at user's location
            const marker = L.marker([latitude, longitude])
                .addTo(map)
                .bindPopup("📍 Fetching address...")
                .openPopup();

            // ✅ Convert Lat/Lng to Address using OpenStreetMap API
            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
                );
                const data = await response.json();
                console.log("✅ Received data:", data); // 🔥 Debugging log

                if (!data.display_name) {
                    console.warn("⚠️ No address found in response!");
                }
                address = data.display_name || "Address not found";

                // Update popup & location details
                marker.setPopupContent(`📍 ${address}`);
                const locationDetails = document.getElementById("locationInfo");
                if (locationDetails) {
                    locationDetails.textContent = `🏠 ${address}`;
                }
                console.log("✅ User Address:", address);
                userAddress = address;
                startContinuousLocationTransmission();
                const userLocation = {
                    lat: latitude,
                    lon: longitude,
                    address: address,
                };

            } catch (error) {
                console.error("❌ Address fetch error:", error);
                document.getElementById("locationDetails").textContent =
                    "⚠️ Unable to retrieve address.";
            }
        },
        (error) => {
            console.error("❌ Geolocation error:", error.message);
            document.getElementById("locationDetails").textContent =
                "⚠️ Location access denied.";
        }
    );
}


let locationUpdateInterval;

window.addEventListener("beforeunload", () => {
    clearInterval(locationUpdateInterval);
});

function startContinuousLocationTransmission() {
    if (initialLocation.latitude === null || initialLocation.longitude === null) {
        console.error("❌ Location is not yet available. Please wait for location fetch.");
        
    }

    // Once location is available, start transmission
    console.log("✅ Location available. Starting continuous transmission...");

    // Now, emit location every 3 seconds
    setInterval(() => {
        const { latitude, longitude } = initialLocation;
        const timestamp = new Date().toISOString();

        socket.emit("user_location", {
            latitude, 
            longitude,
            timestamp,
        });

        console.log("📤 Sent location:", latitude, longitude, timestamp);
    }, 3000); // Transmit location every 3 seconds
}

async function updateClockButton() {
    if (!user) {
        console.error("❌ User is missing.");
        return;
    }

    try {
        const response = await fetch("/records/get-last-clock-event", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ userPath: user.userPath }) // 🔥 Send userId in the body
        });

        if (!response.ok) {
            throw new Error("Failed to fetch last clock event.");
        }

        const lastEvent = await response.json();
        console.log("Last Event:", lastEvent);
        
        const clockInBtn = document.getElementById("clock-in-btn");

        if (!lastEvent || !lastEvent.type || !lastEvent.timestamp) {
            // No previous event, allow clock in
            clockInBtn.textContent = "Clock In";
            clockInBtn.disabled = false;
            return;
        }

        const lastEventType = lastEvent.type; // "clock_in" or "clock_out"
        const lastEventDate = new Date(lastEvent.timestamp._seconds * 1000).toDateString();
        const todayDate = new Date().toDateString();
        const lastEventDateTime = `${new Date(lastEvent.timestamp._seconds * 1000).toLocaleDateString()} ${new Date(lastEvent.timestamp._seconds * 1000).toLocaleTimeString()}`;
        

        console.log("📅 Last Event Date:", lastEventDate);
        console.log("📅 Today's Date:", todayDate);
        console.log("📅 Today's DateTime:", lastEventDateTime);

        if (lastEventType === "clock_in" && lastEventDate === todayDate) {
            // If last event was "clock in" today, change button to "Clock Out"
            clockInBtn.textContent = "Clock Out";
            clockInBtn.disabled = false;

        } else if (lastEventType === "clock_out" && lastEventDate === todayDate) {
            // If last event was "clock out" today, disable button
            clockInBtn.textContent = "Clock Out (Completed)";
            clockInBtn.disabled = true;
            
        } else {
            // Otherwise, allow a new "Clock In" for the next day
            clockInBtn.textContent = "Clock In";
            clockInBtn.disabled = false;
        }
    } catch (error) {
        console.error("❌ Error fetching last clock event:", error);
    }
}

async function clockIn() {
    if (!address || !user) {
        console.error("❌ Missing address or user.");
        return;
    }

    const comments = document.getElementById("clock-comment").value || "";
    const response = await fetch("/records/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPath: user.userPath, address: address, fullName:user.displayName, comments: comments }),
    });

    const result = await response.json();
    console.log(result);
    console.log("emit:", result.emit)
    if (socket) {
        socket.emit("clocking_status", {message: result.emit});
    }
    await updateClockButton();
    fetchLastClocking();
}

function downloadCSV(username) {
    if (!window.fetchedEvents || window.fetchedEvents.length === 0) {
        alert("No data to download.");
        return;
    }

    let csvContent = `"Name","Clock In Time","Clock In Location","Clock In Comment","Clock Out Time","Clock Out Location","Clock Out Comment"\n`;

    window.fetchedEvents.forEach(event => {
        let clockInTime = event.clockInTime
            ? new Date(event.clockInTime._seconds * 1000).toLocaleString()
            : "N/A";

        let clockOutTime = event.clockOutTime
            ? new Date(event.clockOutTime._seconds * 1000).toLocaleString()
            : "N/A";

        let row = [
            `"${username}"`,
            `"${clockInTime}"`,
            `"${event.clockInLocation || "N/A"}"`,
            `"${event.clockInComment || "N/A"}"`,
            `"${clockOutTime}"`,
            `"${event.clockOutLocation || "N/A"}"`,
            `"${event.clockOutComment || "N/A"}"`
        ].join(",");

        csvContent += row + "\n";
    });

    // Create a Blob and download it as a file
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "clock_events.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function closeProfileModal() {
   document.getElementById("profile-modal").close()
};

// 🕒 Function to format Firestore Timestamps
function formatTimestamp(timestamp) {
    if (!timestamp || !timestamp._seconds) return "N/A";
    const date = new Date(timestamp._seconds * 1000);
    return date.toLocaleString(); 
}

async function fetchLastClocking() {
    try {
        const response = await fetch("/records/get-last-clocking", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userPath: user.userPath }),
        });

        const data = await response.json();
        console.log("last clocking Data:", data);

        if (response.ok) {
            const clockIn = data.lastClockInTime ? new Date(data.lastClockInTime) : null;
            const clockOut = data.lastClockOutTime ? new Date(data.lastClockOutTime) : null;

            // 🎯 Format Date and Time Together with day first (dd/mm/yyyy)
            document.getElementById("lastClockIn").textContent = clockIn 
                ? `${clockIn.toLocaleDateString("en-GB")} ${clockIn.toLocaleTimeString()}` 
                : "N/A";

            document.getElementById("lastClockOut").textContent = clockOut 
                ? `${clockOut.toLocaleDateString("en-GB")} ${clockOut.toLocaleTimeString()}` 
                : "N/A";
             // 🔄 Update the UI with the fetched data
        } else {
            console.error("❌ Error:", data.error);
        }
    } catch (error) {
        console.error("❌ Error fetching lastClocking:", error);
    }
}

let adminID;
let managerID;

document.addEventListener("DOMContentLoaded", function () { 
    const userCreds = sessionStorage.getItem("userCreds");
    console.log("userCreds",userCreds);
    console.log("userCreds");

    if (userCreds) {
        user = JSON.parse(userCreds);
        console.log("👤 User Retrieved:", user);
        console.log("👤 User name:", user.displayName);
    
        const pathArray = user.userPath.split("/");
        adminID = pathArray[3];
        managerID = pathArray[5];
    } else {
    console.log("❌ No user found in sessionStorage. Redirecting to login.");
    window.location.href = "/worker"; 
}

    const token = sessionStorage.getItem("token");
    const targetUID = user.adminUid;
    const managerUID = user.managerUid
    if (token) {       
        console.log("isConnected in sessionStorage:", sessionStorage.getItem(`isConnected_${user.uid}`));
        if (!sessionStorage.getItem(`isConnected_${user.uid}`)) {
            console.log("🔌 Establishing new socket connection...");

            // Initialize a new socket connection
            socket = io("http://localhost:3000", { auth: { token: token, targetUID: targetUID, managerUID: managerUID, adminID: adminID, managerID: managerID, managerUID: managerUID } });

            socket.on("connect", () => {
                console.log("🔌 Connected to Socket.IO with token:");
                sessionStorage.setItem(`isConnected_${user.uid}`, 'true');
            });

            socket.on("connect_error", (err) => {
                console.error("❌ Socket connection error:", err.message);
                if (err.message === "Authentication error") {
                    alert("Session expired. Logging you out.");
                    logout();
                }
            });

            // Handle disconnect
            socket.on("disconnect", () => {
                console.log("❌ Disconnected from server.");
                sessionStorage.removeItem('isConnected');
                logout();
            });

            socket.on("multiple_login_refusal", (data) => {
                alert(data.message); 
            });
        } else {
            console.log("🔌 Already connected, no need to send login message again.");
            socket = io("http://localhost:3000");  // Use the existing connection without creating a new one
        }
    } else {
        console.error("❌ No token found in sessionStorage.");
    }

    if (typeof firebase === "undefined") {
        console.error("❌ Firebase is not loaded. Check script paths!");
        return;
    }

    const logOutBtn = document.getElementById("logOut");
    if (logOutBtn) {
        logOutBtn.addEventListener("click", logout);
    } else {
        console.error("❌ Logout button not found! Check HTML.");
    }

    document.getElementById("notificationsContainer").addEventListener("click", () => {
        const noteDropdown = document.getElementById("notificationsDropdown");
        noteDropdown.classList.toggle("show"); // Toggle class instead of modifying `display`
    });

    fetchLastClocking(userId);
    initMapAndFetchLocation();
    updateClockButton();

    setTimeout(() => {
        bodyHtml =  document.body.innerHTML;
    }, 1000); // Allow time for the map to load

    document.getElementById("clock-in-btn").addEventListener("click", () => {
        if (!address) {
            document.getElementById("clock-in-btn").disabled = true; // ✅ Corrected
            console.error("❌ Address not available.");
            return;
        }
    
        console.log("✅ Address Ready:", address, "UserId:",userId);
        clockIn();
    });

    document.getElementById("home-btn").addEventListener("click", () => {
        document.body.innerHTML = bodyHtml;
        fetchLastClocking();
        attachEventListeners();
    });
    
    document.getElementById("myReport").addEventListener("click",()=> fetchClockEvents(userId, userName));     

    document.getElementById("profile").addEventListener("click", function (event) {
        event.preventDefault(); 
        fetchAndDisplayProfile(); 
    });

});


// Function to reattach event listeners
function attachEventListeners() {
    document.getElementById("home-btn")?.addEventListener("click", () => {
        document.body.innerHTML = bodyHtml;
        fetchLastClocking(userId);
        attachEventListeners();
    });

    document.getElementById("logOut")?.addEventListener("click", logout);
    document.getElementById("myReport").addEventListener("click",()=> fetchClockEvents(userId, userName));
    document.getElementById("clock-in-btn").addEventListener("click", () => {
        if (!address) {
            document.getElementById("clock-in-btn").disabled = true; // ✅ Corrected
            console.error("❌ Address not available.");
            return;
        }
    
        console.log("✅ Address Ready:", address, "UserId:",userId);
        clockIn();
    });
    document.getElementById("profile").addEventListener("click", function (event) {
        event.preventDefault(); 
        fetchAndDisplayProfile(); 
    });    
    
    document.getElementById("notificationsContainer").addEventListener("click", () => {
        const noteDropdown = document.getElementById("notificationsDropdown");
        noteDropdown.classList.toggle("show"); // Toggle class instead of modifying `display`
    });
    
    initMapAndFetchLocation(); // Reinitialize map
    updateClockButton(); // Reinitialize clock
}


window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    'size': 'invisible',
    'callback': (response) => {
        console.log("reCAPTCHA verified");
    }
});



