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
        window.location.href = "/manager"; 
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

    // ✅ Initialize Leaflet map (after replacing body, make sure the map element exists)
    const mapElement = document.getElementById("map");
    if (!mapElement) {
        console.error("❌ Map element not found.");
        return;
    }

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

// Attach the function to an event or call it after content is dynamically updated
function updateContentAndInitialize() {
    // Replace body or content here...
    // After updating the DOM, call initMapAndFetchLocation again.
    setTimeout(initMapAndFetchLocation, 0); // Delay to ensure DOM is updated
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
    }, 10000); // Transmit location every 3 seconds
}



function createWorkerSignupForm() {
    const formHTML = `
        <form id="employeeSignupForm">
            <label for="signUpFirstName">First Name</label>
            <input type="text" id="signUpFirstName" required>

            <label for="signUpLastName">Last Name</label>
            <input type="text" id="signUpLastName" required>

            <label for="signUpEmail">Email</label>
            <input type="email" id="signUpEmail" required name="new-email">

            <label for="signUpPassword">Password</label>
            <input type="password" id="signUpPassword" required>

            <label for="signUpPhoneNumber">Phone Number</label>
            <input type="tel" id="signUpPhoneNumber" required>

            <label for="signUpGender">Gender</label>
            <select id="signUpGender" required>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
            </select>

            <label for="signUpDepartment">Department</label>
            <input type="text" id="signUpDepartment" required>

            <button type="submit">Register</button>
            <p>This form will be used to register a subordinate employee</p>
        </form>
    `;

    // Inject form into contentDisplay
    document.getElementById("right-side").innerHTML = formHTML;
    // Handle Form Submission
    document.getElementById("employeeSignupForm").addEventListener("submit", async function(event) {
        event.preventDefault();

        if (!user || !user.userPath) {
            console.error("❌ Error: userPath is missing in userCreds", user);
            alert("❌ Error: userPath is missing. Please log in again.");
            return;
        }

        const userPathParts = user.userPath.split("/");
        const supervisingManagerID = userPathParts.at(-1);
        console.log(supervisingManagerID);

        const newEmpData = {
            firstName: document.getElementById("signUpFirstName").value.trim(),
            lastName: document.getElementById("signUpLastName").value.trim(),
            email: document.getElementById("signUpEmail").value.trim(),
            password: document.getElementById("signUpPassword").value,
            phoneNumber: document.getElementById("signUpPhoneNumber").value.trim(),
            gender: document.getElementById("signUpGender").value,
            role: "worker",
            department: document.getElementById("signUpDepartment").value.trim(),
            creatorID: user.registrarID,
            supervisingManagerID: supervisingManagerID
        };

        if (!newEmpData.creatorID) {
            alert("❌ Error: User UID not found. Please log in again.");
            return;
        }

        console.log("📌 New Employee Data:", newEmpData);

        // Send data to backend API
        try {
            const response = await fetch("/manager/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(newEmpData)
            });

            console.log("📌 Raw Response:", response);

            let result;
            try {
                result = await response.json();
                console.log("📌 Parsed JSON:", result);
            } catch (jsonError) {
                console.error("❌ JSON Parse Error:", jsonError);
                alert("⚠️ Unexpected server response. Please try again.");
                return;
            }

            if (!response.ok) {
                console.error("❌ Server Error:", result);
                alert(`❌ ${result?.error || "Failed to register employee."}`);
                return;
            }

            if (result.success) {
                alert("✅ Employee registered successfully!");
                document.getElementById("employeeSignupForm").reset();
            } else {
                alert(result.error || "⚠️ Employee registration failed. Please try again.");
                document.getElementById("employeeSignupForm").reset();
            }

        } catch (error) {
            console.error("❌ Registration Error:", error);
            alert(`❌ ${error.message}`);
        }
    });
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

async function fetchClockEvents(userId, username) {
    try {
        const response = await fetch("/get-clock-events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: userId
            }),
        });

        const events = await response.json();

        console.log("📜 Clock Events:", events);

        if (!Array.isArray(events)) {
            console.error("❌ Invalid response format:", events);
            return;
        }


        events.sort((a, b) => (a.clockInTime?._seconds || 0) - (b.clockInTime?._seconds || 0));
        window.fetchedEvents = events;

        const container = document.getElementById("right-side");
        container.innerHTML = ""; // Clear old table

        // Create a button for downloading CSV
        const downloadBtn = document.createElement("button");
        downloadBtn.innerText = "Download CSV";
        downloadBtn.onclick = () => downloadCSV(username);
        container.appendChild(downloadBtn);

        const table = document.createElement("table");
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Clock In Time</th>
                    <th>Clock In Location</th>
                    <th>Clock In Comment</th>
                    <th>Clock Out Time</th>
                    <th>Clock Out Location</th>
                    <th>Clock Out Comment</th>
                </tr>
            </thead>
            <tbody id="events-table-body"></tbody>
        `;


        const tbody = table.querySelector("tbody");

        events.forEach(event => {
            const clockInTime = event.clockInTime
                ? new Date(event.clockInTime._seconds * 1000).toLocaleString()
                : "N/A";

            const clockOutTime = event.clockOutTime
                ? new Date(event.clockOutTime._seconds * 1000).toLocaleString()
                : "N/A";

            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${clockInTime}</td>
                <td>${event.clockInLocation}</td>
                <td>${event.clockInComment || "N/A"}</td>
                <td>${clockOutTime}</td>
                <td>${event.clockOutLocation}</td>
                <td>${event.clockOutComment || "N/A"}</td>
            `;
            tbody.appendChild(row);
        });


        container.appendChild(table);

        // Save the latest timestamp for the next request
        if (events.length > 0) {
            lastTimestamp = events[events.length - 1].timestamp._seconds * 1000;
        }
    } catch (error) {
        console.error("❌ Error fetching clock events:", error);
    }
}

async function fetchWorkerProfile(userId) {
    const workerPath = `${user.userPath}/workers/${userId}`; // Corrected path construction

    try {
        const response = await fetch("/manager/subordinates/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userPath: workerPath }), // Corrected request body
        });

        const userData = await response.json();

        if (userData.error) {
            console.error("Error:", userData.error);
            return;
        }

        console.log("✅ User Document:", userData);

        displayWorkerProfile(userData);
    } catch (error) {
        console.error("❌ Error fetching user document:", error);
    }
}


function displayWorkerProfile(userData) {
    const profileModal = document.getElementById("profile-modal");
    const profileContainer = document.getElementById("profile-container");

    if (!profileModal) {
        console.error("❌ Error: #profile-modal not found in the DOM!");
        return;
    }
    if (!profileContainer) {
        console.error("❌ Error: #profile-container not found in the DOM!");
        return;
    }

    // Show modal before updating innerHTML
    profileModal.showModal()

    // Now update profileContainer
    profileContainer.innerHTML = `
        <h3>${userData.fullName}</h3>
        <p><strong>Email:</strong> ${userData.email}</p>
        <p><strong>Phone:</strong> ${userData.phoneNumber}</p>
        <p><strong>Gender:</strong> ${userData.gender}</p>
        <p><strong>Role:</strong> ${userData.role}</p>
        <p><strong>Role:</strong> ${userData.department}</p>
    `;
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

function fetchWorkersData() {
    const userPath = user.userPath;

    fetch("/manager/subordinates", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ userPath })
    })
    .then(response => response.json())
    .then(data => {
        const employeesList = document.getElementById("right-side");
        employeesList.innerHTML = "";  // Clear previous content
        console.log(data);

        // Create a table for displaying employee data
        const table = document.createElement("table");
        table.classList.add("employees-table");

        // Create table header
        const headerRow = document.createElement("tr");
        headerRow.innerHTML = `
            <th>Full Name</th>
            <th>Actions</th>
        `;
        table.appendChild(headerRow);

        // Add employee data as table rows
        data.employees.forEach(employee => {
            const row = document.createElement("tr");

            row.innerHTML = `
                <td><strong>${employee.fullName}</strong></td>
                <td>
                    <div class = "d-flex justify-content-evenly action-buttons">
                    <button class="icon-button" title="View Reports" onclick="fetchClockEvents('${employee.id}', '${employee.fullName}')">
                        <i class="fas fa-file-alt fa-2x"></i>
                    </button>
                    <button class="icon-button delete-btn" title="Delete" onclick="deleteWorkerProfile('${employee.id}')">
                        <i class="fas fa-trash fa-2x"></i>
                    </button>
                    <button class="icon-button" title="View Profile" onclick="fetchWorkerProfile('${employee.id}')">
                        <i class="fas fa-user fa-2x"></i>
                    </button>
                    </div>
                </td>
            `;

            table.appendChild(row);
        });

        // Append the table to the employeesList
        employeesList.appendChild(table);

        if (!document.getElementById("profile-modal")) {
            const modal = document.createElement("dialog");
            modal.id = "profile-modal";
            modal.innerHTML = `
                <div class="modal-content">
                    <span class="close-btn" onclick="closeProfileModal()">&times;</span>
                    <div id="profile-container"></div>
                </div>
            `;
            document.body.appendChild(modal);
        }
    })
    .catch(error => {
        console.error("❌ Error fetching workers data:", error);
    });
}

function deleteWorkerProfile(userId) {
    // Construct the userPath dynamically based on userId
    const workerPath = `${user.userPath}/workers/${userId}`;

    // Confirm the deletion
    const isConfirmed = confirm("⚠️ Are you sure you want to delete this user? This action cannot be undone.");

    if (!isConfirmed) {
        console.log("❌ Deletion canceled by user.");
        return; // Stop execution if the user cancels
    }

    // Proceed with deleting the user if confirmed
    fetch("/manager/subordinates/delete", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ userPath: workerPath })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            console.log(data.message);  // Success message from backend
            alert(`Worker profile for ${workerPath} has been deleted.`);
            // Optionally, refresh the page or update the UI
        } else {
            console.error("Error:", data.error);
            alert("Failed to delete worker profile.");
        }
    })
    .catch(error => {
        console.error("❌ Error deleting worker profile:", error);
    });
}

function updateBadgeCount() {
    const badge = document.querySelector(".badge");

    // Count total notifications from the array, not the DOM
    const totalCount = notificationsExt.length;

    // Update the badge count
    badge.textContent = totalCount;

    if (totalCount > 0) {
        badge.style.backgroundColor = "red";
        badge.style.color = "white";
        badge.style.display = "inline-block";
        badge.textContent = totalCount;
    } else {
        badge.style.backgroundColor = "blue";
        badge.textContent = 0;

        // Remove Clear All button if it exists
        const clearAllBtn = document.getElementById("clearAllBtn");
        if (clearAllBtn) clearAllBtn.remove();
    }
}

function displayNotificationsList() {
    const notificationBarRows = document.querySelectorAll(".notificationBarRow");
    const container = document.getElementById("right-side");
    container.innerHTML = ""; // Clear previous notifications

    console.log(notificationsExt);

    const notificationsWrapper = document.createElement("div");
    notificationsWrapper.id = "notificationsWrapper";
    notificationsWrapper.style.border = "2px solid #ddd";
    notificationsWrapper.style.borderRadius = "8px";
    notificationsWrapper.style.padding = "10px";
    notificationsWrapper.style.margin = "10px 0";
    notificationsWrapper.style.backgroundColor = "#f0f0f0";

    if (notificationsExt.length === 0) {
        notificationsWrapper.remove();
        container.textContent = "No Notifcations Available";
    }

    notificationsExt.forEach((message, index) => {
        const messageDiv = document.createElement("div");
        messageDiv.classList.add("notification-item");
        messageDiv.style.display = "flex";
        messageDiv.style.justifyContent = "space-between";
        messageDiv.style.alignItems = "center";
        messageDiv.style.padding = "10px";
        messageDiv.style.margin = "5px 0";
        messageDiv.style.border = "1px solid #ccc";
        messageDiv.style.borderRadius = "5px";
        messageDiv.style.backgroundColor = "#fff";

        // Message Text
        const messageText = document.createElement("span");
        messageText.innerText = message.message;

        // Remove Button (❌)
        const removeBtn = document.createElement("button");
        removeBtn.classList.add("noteMenuRemove");
        removeBtn.innerText = "❌";
        removeBtn.style.marginLeft = "10px";
        removeBtn.style.cursor = "pointer";
        removeBtn.style.border = "none";
        removeBtn.style.background = "white";
        removeBtn.style.color = "white";
        removeBtn.style.borderRadius = "3px";
        removeBtn.style.padding = "5px";

        // Remove Button Click Event
        removeBtn.onclick = () => {
            notificationsExt.splice(index, 1);
            messageDiv.remove();
            const rowToRemove = Array.from(notificationBarRows).find(el => el.id === message.id);
            if (rowToRemove) {
                rowToRemove.remove();
            }

            socket.emit('delete_notification', { notificationId: message.id });

            updateBadgeCount();
            // Remove the wrapper if no messages are left
            if (notificationsExt.length === 0) {
                notificationsWrapper.remove();
                container.textContent = "No Notifcations Available";
            }
        };

        messageDiv.appendChild(messageText);
        messageDiv.appendChild(removeBtn);
        notificationsWrapper.appendChild(messageDiv);
    });

    // Append only if there are messages
    if (notificationsExt.length > 0) {
        container.appendChild(notificationsWrapper);
    }
}

let notificationsExt = [];

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
    window.location.href = "/manager"; 
}

    const token = sessionStorage.getItem("token");
    const targetUID = user.adminUid;
    if (token) {       
        console.log("isConnected in sessionStorage:", sessionStorage.getItem(`isConnected_${user.uid}`));
        if (!sessionStorage.getItem(`isConnected_${user.uid}`)) {
            console.log("🔌 Establishing new socket connection...");
            const socketUrl = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'http://192.168.67.113:3000';
            // Initialize a new socket connection
            socket = io(socketUrl, { auth: { token: token, targetUID: targetUID, adminID: adminID, managerID: managerID } });

            socket.on("connect", () => {
                console.log("🔌 Connected to Socket.IO with token:");
                sessionStorage.setItem(`isConnected_${user.uid}`, 'true');
            });

            socket.on("private_message", (data) => {
                console.log(`📩 New private message from ${data.sender}: ${data.message}`);                
                //displayNotification(data.message);
            });

            socket.on("previousMessages", (messages) => {
                console.log("📩 Loading previous messages...");
                messages.forEach((message) => {
                    console.log(`📩 Previous message from ${message.sender}: ${message.message}`);
                    if (!notificationsExt.some(existingMessage => existingMessage.id === message.id)) notificationsExt.push(message);
                    updateBadgeCount();
                });
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
        displayNotificationsList();
    });
    
    initMapAndFetchLocation();

    setTimeout(() => {
        bodyHtml =  document.body.innerHTML;
    }, 1000); // Allow time for the map to load

  
    document.getElementById("registerEmployee").addEventListener("click",createWorkerSignupForm);

    document.getElementById("home-btn").addEventListener("click", () => {
        document.body.innerHTML = bodyHtml;
        attachEventListeners();
    });
    
    document.getElementById("myReport").addEventListener("click",()=> fetchClockEvents(userId, userName));     

    document.getElementById("profile").addEventListener("click", function (event) {
        event.preventDefault(); 
        fetchAndDisplayProfile(); 
    });

    document.getElementById("subOrds").addEventListener("click",fetchWorkersData);
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
    document.getElementById("profile").addEventListener("click", function (event) {
        event.preventDefault(); 
        fetchAndDisplayProfile(); 
    });    
    document.getElementById("subOrds").addEventListener("click", fetchWorkersData);
    document.getElementById("registerEmployee").addEventListener("click",createWorkerSignupForm);

    document.getElementById("notificationsContainer").addEventListener("click", () => {
        displayNotificationsList();
    });
    
    updateContentAndInitialize();
    updateBadgeCount();
}


window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    'size': 'invisible',
    'callback': (response) => {
        console.log("reCAPTCHA verified");
    }
});

// 🔥 Send OTP to phone

