const firebaseConfig = {
    apiKey: "AIzaSyAeOIg82jbmV0pNamZRT_hkz4ekXawDqgc",
    authDomain: "employee-tracker-2.firebaseapp.com",
    projectId: "employee-tracker-2",
    storageBucket: "employee-tracker-2.firebasestorage.app",
    messagingSenderId: "567769082501",
    appId: "1:567769082501:web:f87f7ea693aab6856217ec"
  };

firebase.initializeApp(firebaseConfig);

let socket;
let onlineCount = 0;
let onlineEmployees ;
let clockedInEmployees;
let clockedOutEmployees ;

if (typeof firebase === "undefined") {
    console.error("Firebase SDK not loaded");
}

const auth = firebase.auth();

let originalHtml;
let userCreds;
let userData;
let searchedTimelines = {};

console.log("type of leaflet:", typeof leafletImage);

let map, userMarker = null;
let timelineElement = null;


async function fetchTodaysClockEvents() {
    try {
        const response = await fetch("/records/get-clock-events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userID: userData.companyName }),
        });

        const data = await response.json();
        console.log("📜 Clock Events Response:", data);

        if (!data.success || !Array.isArray(data.clockEvents)) {
            console.error("❌ Invalid response format:", data);
            return;
        }

        const events = data.clockEvents;

        // ✅ Get today's date as a formatted string
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        // ✅ Filter only events where clockInTime is today
        const filteredEvents = events.filter(event => {
            if (!event.clockInTime || !event.clockInTime._seconds) return false;

            const eventDate = new Date(event.clockInTime._seconds * 1000);
            const eventDateStr = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;

            return eventDateStr === todayStr;
        });

        // ✅ Sort by clockInTime
        filteredEvents.sort((a, b) => (a.clockInTime?._seconds || 0) - (b.clockInTime?._seconds || 0));

        // ✅ Split into clocked in / out
        const clockedInEvents = filteredEvents.filter(e => e.status === "clocked in");
        const clockedOutEvents = filteredEvents.filter(e => e.status === "clocked out");

        clockedInEmployees = clockedInEvents;
        clockedOutEmployees = clockedOutEvents;

        document.getElementById("clockInCount").textContent = clockedInEmployees.length;
        document.getElementById("clockOutCount").textContent = clockedOutEmployees.length ;

        console.log("🟢 Clocked In:", clockedInEvents);
        console.log("🔴 Clocked Out:", clockedOutEvents);
    } catch (error) {
        console.error("❌ Error fetching clock events:", error);
    }
}

function setCoords() {
    document.getElementById("content-wrapper").innerHTML = "<h2 class = 'pageTopic'>Settings</h2>";
    document.getElementById("recentClocksSpan").textContent = "";
    document.getElementById("recentClockingsDisplay").innerHTML = `
    <form id="locationForm">
      <label for="latitude">Latitude:</label>
      <input type="number" id="latitude" name="latitude" step="any"><br><br>

      <label for="longitude">Longitude:</label>
      <input type="number" id="longitude" name="longitude" step="any"><br><br>

      <button type="submit" style="border-radius: 5px; background-color: lightseagreen; padding:5px;">Submit</button>
    </form>
    <p id="coordsRes"></p>
  `;
    document.getElementById("locationForm").addEventListener("submit", async (event) => {
        event.preventDefault();

        const latitude = document.getElementById("latitude").value;
        const longitude = document.getElementById("longitude").value;

        const adminID = userData.companyName;

        try {
            const response = await fetch('/records/set-mapCoords', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    adminID: adminID,
                    latitude: latitude,
                    longitude: longitude,
                }),
            });

            // Check if the response is ok (status code 200-299)
            if (response.ok) {
                const result = await response.json();
                console.log("Success:", result.message);
                document.getElementById("coordsRes").textContent = result.message;
                setTimeout(function () {
                    document.getElementById("coordsRes").textContent = "";
                }, 3000);

            } else {
                const errorResult = await response.json();
                console.error("Error:", errorResult.error);
                document.getElementById("coordsRes").textContent = errorResult.error;
                setTimeout(function () {
                    document.getElementById("coordsRes").textContent = "";
                }, 3000);

            }
        } catch (error) {
            console.error('Request failed', error); 
            document.getElementById("coordsRes").textContent = error;
            setTimeout(function () {
                document.getElementById("coordsRes").textContent = "";
            }, 3000);

        }
    });
};

async function getMapCoords(adminID) {
    try {
        const response = await fetch('/records/retrieve-mapCoords', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ adminID: adminID }),
        });

        if (response.ok) {
            const data = await response.json();
            console.log('Retrieved Coordinates:', data.coordinates);
            return data.coordinates;
        } else {
            const errorData = await response.json();
            console.error('Error retrieving coordinates:', errorData.error);
            return null;
        }
    } catch (error) {
        console.error('Network error:', error);
        return null;
    }
}

async function logout() {
    try {
        await firebase.auth().signOut();
        console.log("✅ Firebase user signed out");
        
        sessionStorage.clear();

        // Expire cookies
        document.cookie = "firebaseIdToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

        // Prevent going back to the dashboard after logout
        window.location.href = "/"; 
        setTimeout(() => {
            history.replaceState(null, null, "/");
        }, 100);
    } catch (error) {
        console.error("❌ Logout error:", error);
    }
}

function dashBoard () {
    userCreds = JSON.parse(sessionStorage.getItem("userCreds"));
    userData = JSON.parse(sessionStorage.getItem("userData"));

    if (!userCreds || !userData) {
        console.error("❌ Missing user credentials or user data. Redirecting to login...");
        window.location.href = "/"; // Redirect if either is missing
        return;
    }
    
    document.getElementById("userEmail").textContent = userCreds.email || "No Email";
    document.getElementById("userName").textContent = userCreds.displayName || "No Name";
    const userPlanElement = document.getElementById("userPlan");

    if (userData.plan) {
        const plan = userData.plan.toLowerCase();
        userPlanElement.textContent = userData.plan.toUpperCase(); // Display plan name in uppercase

        // Assign colors based on plan
        const planColors = {
            silver: "#C0C0C0",  // Silver color
            gold: "#FFD700",    // Gold color
            platinum: "#E5E4E2", // Platinum color
            diamond: "#B9F2FF"  // Diamond color (light blue)
        };

        userPlanElement.style.backgroundColor = planColors[plan] || "#000"; // Default to black if not found
    } else {
        userPlanElement.textContent = "No Plan";
        userPlanElement.style.backgroundColor = "#000"; // Default black color
    }
}

function displayCurrentClocks(recList, recText, type) {
    const container = document.getElementById("recentRecs");
    container.innerHTML = "";

    // 🔹 Create Table
    const table = document.createElement("table");
    table.classList.add("manager-table");

    // 🔹 Create Table Header
    const thead = document.createElement("thead");
    thead.innerHTML = `
            <tr>
                <th><button class="sort-btn" onclick="sortTable(0)">Full Name</button></th>
                <th><button class="sort-btn" onclick="sortTable(1)">Department</button></th>
                <th><button class="sort-btn" onclick="sortTable(2)">Clock</button></th>
                <th><button class="sort-btn" onclick="sortTable(2)">Status</button></th>
            </tr>
        `;
    table.appendChild(thead);

    // 🔹 Create Search Bar
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search...";
    searchInput.title = "Search by name, time or department";
    searchInput.id = "searchInput";
    container.appendChild(searchInput);

    searchInput.addEventListener("input", filterTable); // Listen for input in the search field

    // 🔹 Create Table Body
    const tbody = document.createElement("tbody");

    recList.forEach(employee => {
        const row = document.createElement("tr");
        if (type = 'clockins') {
            const clocktime = employee.clockInTime?._seconds
                ? new Date(employee.clockInTime._seconds * 1000).toLocaleString()
                : "—";
            row.innerHTML = `
            <td>${employee.name}</td>
            <td>${employee.department}</td>
            <td>${clocktime}</td>
            <td>${employee.status}</td>       
        `
        } else if (type = 'clockouts') {
            const clocktime = employee.clockInTime?._seconds
                ? new Date(employee.clockInTime._seconds * 1000).toLocaleString()
                : "—";
            row.innerHTML = `
            <td>${employee.name}</td>
            <td>${employee.department}</td>
            <td>${clocktime}</td>
            <td>${employee.status}</td>       
        `
        }
        ;


        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);
    document.getElementById("recentClocksSpan").innerHTML = `<h2 class='pageTopic' style='font-size: 24px;'> ${recText}</h2>`;

}

function displayCurrentRecs(recList, recText) {
    const container = document.getElementById("recentRecs");
    container.innerHTML = "";

    // 🔹 Create Table
    const table = document.createElement("table");
    table.classList.add("manager-table");

    // 🔹 Create Table Header
    const thead = document.createElement("thead");
    thead.innerHTML = `
            <tr>
                <th><button class="sort-btn" onclick="sortTable(0)">Full Name</button></th>
                <th><button class="sort-btn" onclick="sortTable(1)">Email</button></th>
                <th><button class="sort-btn" onclick="sortTable(2)">Phone</button></th>
                <th><button class="sort-btn" onclick="sortTable(3)">Department</button></th>
                <th><button class="sort-btn" onclick="sortTable(5)">Role</button></th>
            </tr>
        `;
    table.appendChild(thead);

    // 🔹 Create Search Bar
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search...";
    searchInput.title = "Search by name, department, email, or phone...";
    searchInput.id = "searchInput";
    container.appendChild(searchInput);

    searchInput.addEventListener("input", filterTable); // Listen for input in the search field

    // 🔹 Create Table Body
    const tbody = document.createElement("tbody");

    recList.forEach(employee => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${employee.displayName}</td>
            <td>${employee.email}</td>
            <td>${employee.phone}</td>
            <td>${employee.department || "N/A"}</td>
            <td>${employee.role}</td>               
        `;


        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);
    document.getElementById("recentClocksSpan").innerHTML = `<h2 class='pageTopic' style='font-size: 24px;'> ${recText}</h2>`;

}

function createAdminSignupForm() {
    const formHTML = `
        <form id="employeeSignupForm">
            <label for="signUpRole">Role</label>
            <select id="signUpRole" required>
                <option value="">Select</option>
                <option value="worker">Worker</option>
                <option value="manager">Manager</option>
            </select> 

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
            
            <!-- Supervising Manager ID (Hidden by Default) -->
            <div id="supervisingManagerContainer" style="display: none;">
                <label for="supervisingManagerID">Supervising Manager's ID</label>
                <input type="text" id="supervisingManagerID">
            </div>

            <button type="submit">Register</button>
        </form>
    `;

    // Inject form into contentDisplay
    document.getElementById("recentRecs").innerHTML = formHTML;
    document.getElementById("recentClocksSpan").innerHTML = "";
    // Get Role and Supervising Manager Elements
    const roleSelect = document.getElementById("signUpRole");
    const supervisorContainer = document.getElementById("supervisingManagerContainer");

    // Toggle Supervising Manager Field Visibility
    roleSelect.addEventListener("change", function () {
        if (roleSelect.value === "worker") {
            supervisorContainer.style.display = "block";  // Show for workers
            document.getElementById("supervisingManagerID").required = true;
        } else {
            supervisorContainer.style.display = "none";   // Hide for managers
            document.getElementById("supervisingManagerID").required = false;
        }
    });

    // Handle Form Submission
    document.getElementById("employeeSignupForm").addEventListener("submit", async function(event) {
        event.preventDefault();

        // Get the selected role
        const selectedRole = roleSelect.value;

        // Validate that role is selected
        if (!selectedRole) {
            alert("❌ Please select a role.");
            return;
        }

        const newEmpData = {
            firstName: document.getElementById("signUpFirstName").value.trim(),
            lastName: document.getElementById("signUpLastName").value.trim(),
            email: document.getElementById("signUpEmail").value.trim(),
            password: document.getElementById("signUpPassword").value,
            phoneNumber: document.getElementById("signUpPhoneNumber").value.trim(),
            gender: document.getElementById("signUpGender").value,
            role: selectedRole,
            department: document.getElementById("signUpDepartment").value.trim(),
            creatorID: sessionStorage.getItem("userData") ? JSON.parse(sessionStorage.getItem("userData")).companyName : null,
            number: typeof userData !== "undefined" ? userData.number : null
        };

        if (!newEmpData.creatorID) {
            alert("❌ Error: User UID not found. Please log in again.");
            return;
        }

        // Add Supervising Manager ID only if the role is "worker"
        if (selectedRole === "worker") {
            newEmpData.supervisingManagerID = document.getElementById("supervisingManagerID").value.trim();
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

function jitterCoords(lat, lon, uid) {
    const offset = 0.00005; // Small offset to separate markers
    // Create a unique jitter based on the UID to ensure different jitter for different users
    const hash = [...uid].reduce((acc, char) => acc + char.charCodeAt(0), 0); // Simple hash from UID
    const index = hash % 100; // Get a number between 0 and 99 for small unique offsets
    return [lat + (offset * Math.sin(index)), lon + (offset * Math.cos(index))];
}

function updateSearchTimeline(uid, lat, lon, label) {
    const timestamp = label || new Date().toLocaleString();
    const entry = { lat, lon, label: timestamp };
  
    if (!searchedTimelines[uid]) {
        searchedTimelines[uid] = [];
    }
  
    searchedTimelines[uid].push(entry);
}

function updateUserTimeline(uid, lat, lon, label) {
    const timestamp = label || new Date().toLocaleString();
    const entry = { lat, lon, label: timestamp };
  
    if (!userTimelines[uid]) {
        userTimelines[uid] = [];
    }
  
    userTimelines[uid].push(entry);
}

async function createMapInRecentClocks() {
    document.getElementById("recentClocksSpan").innerHTML = '';
    document.getElementById("content-wrapper").innerHTML = `<h2 class='pageTopic'>Live Location</h2>`;
    const recentClocks = document.getElementById("recentRecs");
    
    console.log('createMapInRecentClocks function active');
    // Initialize the HTML structure for map and timeline
    recentClocks.innerHTML = `
    <button id="refreshMapBtn" style="margin-bottom: 10px;">🔄 Refresh Map</button>
    <div id="map" class="map-container" style="height: 400px; width: 100%;"></div>
    <p id="coordsMessage"></p>
    <div id="timeline" class="timeline"></div>
    `;
    
    const refreshBtn = document.getElementById("refreshMapBtn");
    refreshBtn.addEventListener("click", createMapInRecentClocks);

    // Get reference to timelineElement after it's added to the DOM
    timelineElement = document.getElementById("timeline");
    const coords = await getMapCoords(userData.companyName);
    console.log("CoordsRaw: ", coords);
    let mapCenter = [0, 0];
    let zoom = 2
    let message = "No preset coordinates available.";

    if (coords) {
        // Parse latitude and longitude as numbers
        const latitude = parseFloat(coords.latitude);
        const longitude = parseFloat(coords.longitude);
        console.log("Latitude:", latitude, "Longitude: ",longitude)
        // Check if parsed values are valid numbers
        if (!isNaN(latitude) && !isNaN(longitude)) {
            mapCenter = [latitude, longitude];
            zoom = 7;
            message = "Preset coordinates retrieved and map initialized.";
        } else {
            message = "Invalid coordinates retrieved.";
        }
    }
    // Initialize the map
    map = L.map("map", { attributionControl: false }).setView(mapCenter, zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
    }).addTo(map);
    
    console.log('Map initialized and ready.');
    document.getElementById("coordsMessage").textContent = message;
    setTimeout(() => {
        document.getElementById("coordsMessage").textContent = '';
    }, 3000);
  
}
 
let userTimelines = {};

function showLocationOnMap(lat, lon, uid, label = null) {
    const userMarkers = {};
    if (!map || !timelineElement) {
        console.warn("⚠️ Map or timeline not initialized.");
        return;
      }
    
      console.log(`showLocationOnMap called for ${uid} at ${lat}, ${lon}`); // Debug log
    
      // Create or update the marker for this user
      if (!userMarkers[uid]) {
        const marker = L.marker([lat, lon]).addTo(map);
        marker.bindPopup(`🧍 ${uid}`);
        userMarkers[uid] = marker;
      } else {
        userMarkers[uid].setLatLng([lat, lon]);
      }

      // Check if the user's timeline element already exists in timelineElement
    let userTimeline = document.getElementById(`timeline-${uid}`);
    
    const entry = `📍 ${lat}, ${lon} @ ${label || timestamp}`;
    if (userTimeline) {
      userTimeline.remove();  // Remove the entire user timeline element
    }
  
    // Create a new timeline element for this user
    userTimeline = document.createElement("div");
    userTimeline.classList.add("user-timeline");
    userTimeline.id = `timeline-${uid}`;
    timelineElement.appendChild(userTimeline); // Append to the main timeline element
  
    // Create the timeline entry element to display the latest location in the DOM
    const entryElement = document.createElement("p");
    entryElement.textContent = `🧍 ${uid}: ${entry}`; 
  
    // Append the new entry to the user's timeline
    userTimeline.appendChild(entryElement);
}

function generateUserMaps(userTimelines) {    
const recentClocks = document.getElementById("recentRecs");
document.getElementById("recentClocksSpan").textContent = "";
recentClocks.innerHTML = ""; 
document.getElementById("content-wrapper").innerHTML = `<h2 class='pageTopic'>Timelines</h2>`;

    // Create a controls container for the search bar and date filter
    const controlsContainer = document.createElement("div");
    controlsContainer.classList.add("m-3");
    controlsContainer.style.display = "flex";
    controlsContainer.style.justifyContent = "space-evenly";
    controlsContainer.style.alignItems = "center";
    controlsContainer.style.marginBottom = "20px";
    
    const fieldset = document.createElement("fieldset");
    fieldset.style.border = "2px solid #ccc";
    fieldset.style.padding = "5px";
    fieldset.style.borderRadius = "5px";

    const dateFilterContainer = document.createElement("div");
    dateFilterContainer.id = "mapDateContainer";
    dateFilterContainer.style.display = "flex";
    dateFilterContainer.style.alignItems = "center";
    dateFilterContainer.style.gap = "10px";

    const dateLegend = document.createElement("legend");
    dateLegend.textContent = "Get records with the date search";
    dateLegend.id = "mapDateLegend";

    const startDateLabel = document.createElement("label");
    startDateLabel.innerText = "Start Date:";
    startDateLabel.style.fontWeight = "bold";

    const startDateInput = document.createElement("input");
    startDateInput.type = "date";
    startDateInput.id = "mapStartDate";
    startDateInput.style.padding = "5px";

    const endDateLabel = document.createElement("label");
    endDateLabel.innerText = "End Date:";
    endDateLabel.style.fontWeight = "bold";

    const endDateInput = document.createElement("input");
    endDateInput.type = "date";
    endDateInput.id = "mapEndDate";
    endDateInput.style.padding = "5px";

    const arrowButton = document.createElement("button");
    arrowButton.classList.add("dateGo");
    arrowButton.innerHTML = "&#8594;"; // Right arrow symbol
    arrowButton.style.fontSize = "20px";
    arrowButton.style.cursor = "pointer";
    arrowButton.onclick = async () => {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        fetchFilteredMaps(startDate, endDate);
    };

    dateFilterContainer.appendChild(dateLegend);
    dateFilterContainer.appendChild(startDateLabel);
    dateFilterContainer.appendChild(startDateInput);
    dateFilterContainer.appendChild(endDateLabel);
    dateFilterContainer.appendChild(endDateInput);
    dateFilterContainer.appendChild(arrowButton);

    // Wrap everything in the fieldset
    fieldset.appendChild(dateLegend);
    fieldset.appendChild(dateFilterContainer);

    controlsContainer.appendChild(fieldset);

    const searchFieldset = document.createElement("fieldset");
    searchFieldset.style.border = "2px solid #ccc";
    searchFieldset.style.padding = "5px";
    searchFieldset.style.borderRadius = "5px";
    const searchBarContainer = document.createElement("div");
    searchBarContainer.style.display = "flex";
    searchBarContainer.style.alignItems = "center";
    searchBarContainer.style.gap = "1px";

    const searchLegend = document.createElement("legend");
    searchLegend.textContent = "filter records with the search bar";
    searchLegend.id = "mapSearchLegend";

    const searchBar = document.createElement("input");
    searchBar.type = "text";
    searchBar.id = "mapSearchRecords";
    searchBar.placeholder = "Search";
    searchBar.style.padding = "5px";
    searchBar.addEventListener("input", filterMaps);

    searchBarContainer.appendChild(searchBar);   
    searchFieldset.appendChild(searchLegend);
    searchFieldset.appendChild(searchBarContainer);

    controlsContainer.appendChild(searchFieldset);

    recentClocks.appendChild(controlsContainer);
    
Object.keys(userTimelines).forEach((uid) => {
    const timeline = userTimelines[uid]; // Get the user's timeline
    if (!timeline || timeline.length === 0) return; // Skip if no data

    // Create map container
    const mapContainer = document.createElement("div");
    const mapId = `map-${uid}`;
    mapContainer.id = mapId;
    mapContainer.style.width = "100%";
    mapContainer.style.height = "300px"; // Ensure maps have height
    mapContainer.style.position = "relative";

    // Create a section to hold user label and map
    const userMapSection = document.createElement("div");
    userMapSection.classList.add("user-map-section");

    // Add user label
    const userLabel = document.createElement("h3");
    userLabel.textContent = `User: ${uid}`;
    userMapSection.appendChild(userLabel);
    userMapSection.appendChild(mapContainer);
    recentClocks.appendChild(userMapSection); 

    // Overlay user name on map
    const overlayText = document.createElement("div");
    overlayText.textContent = `User: ${uid}`;
    overlayText.style.position = "absolute";
    overlayText.style.top = "10px";
    overlayText.style.left = "50%";
    overlayText.style.transform = "translateX(-50%)";
    overlayText.style.background = "rgba(0, 0, 0, 0.5)";
    overlayText.style.color = "#fff";
    overlayText.style.padding = "5px 10px";
    overlayText.style.borderRadius = "5px";
    overlayText.style.fontSize = "14px";
    overlayText.style.fontWeight = "bold";
    mapContainer.appendChild(overlayText);

    // Extract first location to center the map
    const firstEntry = timeline[0];
    const firstLat = firstEntry.lat;
    const firstLon = firstEntry.lon;

    // Initialize map with setView (Remove Leaflet logo)
    const map = L.map(mapId, { attributionControl: false })
        .setView([firstLat, firstLon], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "",
    }).addTo(map);

    // Store lat/lon points for polyline
    const latLngs = [];

    timeline.forEach((entry) => {
        const lat = entry.lat;
        const lon = entry.lon;
    
        // Extract date from entry
        const dateText = entry.label || "No Date";
    
        // Add marker
        const marker = L.marker([lat, lon]).addTo(map);
        marker.bindPopup(`🧍 ${uid}<br>${dateText}`);
    
        latLngs.push([lat, lon]); // Store for polyline
    });

    // Draw movement path if multiple locations exist
    if (latLngs.length > 1) {
        L.polyline(latLngs, { color: "blue", weight: 3 }).addTo(map);
        map.fitBounds(latLngs); // Auto-adjust zoom to fit all points
    }

    // Add download button
    const downloadBtn = document.createElement("button");
    downloadBtn.classList.add("mapDownloadBtn")
    downloadBtn.textContent = "Download Map";
    downloadBtn.style.marginTop = "10px";
    downloadBtn.onclick = () => downloadMap(map, uid);
    userMapSection.appendChild(downloadBtn);
});
}
// Function to download the map as an image
function downloadMap(mapElement, userId) {
    leafletImage(mapElement, function(err, canvas) {
        if (err) {
            console.error('Error generating map image:', err);
            return;
        }

        const link = document.createElement("a");
        link.href = canvas.toDataURL("image/png");
        link.download = `map_${userId}.png`;
        link.click();
    });
}

async function fetchManagerSubordinates(id, name) {
    const userPath = `user2/app_owner/admin/${userData.companyName}/managers/${id}`;
    console.log("userPath:", userPath);  // 🔍 check this
    console.log("userData:", userData);  // 🔍 make sure this exists

    const requestBody = JSON.stringify({ userPath });
    console.log("Sending:", requestBody);  // 🔍 confirm format

    const requestHeaders = {
        'Content-Type': 'application/json',
    };

    try {
        const response = await fetch('/manager/subordinates', {
            method: 'POST',
            headers: requestHeaders,
            body: requestBody,
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Response:', data);


        let employees = data.employees;

        if (!Array.isArray(employees)) {
            employees = [employees];
        }

        displayManagerSubordinates(employees, name);

    } catch (error) {
        console.error('Error posting to /manager/subordinates:', error);
    }
}

function displayManagerSubordinates(employees, name) {
    document.getElementById("content-wrapper").innerHTML = `
    <h2 class="pageTopic">Subordinates for</h2>
    <h2 class="pageTopic">${name}</h2>
`;
    document.getElementById("recentClocksSpan").innerHTML = `<button id="returnToEmployees" style="margin-bottom: 10px;" onclick="fetchUserDataWithSubordinates(userData.companyName);">🔄 Back</button>`;


    const container = document.getElementById("recentRecs");
    container.innerHTML = ""; // Clear previous content

    if (!employees || employees.length === 0) {
        container.textContent = "No employees found.";
        return;
    }

    // Create table
    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.marginTop = "10px";

    // Header row
    const headers = ["Full Name", "Email", "Phone Number", "Gender", "Department", "ID"];
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    headers.forEach(header => {
        const th = document.createElement("th");
        th.textContent = header;
        th.style.border = "1px solid #ccc";
        th.style.padding = "8px";
        th.style.backgroundColor = "#f2f2f2";
        th.style.textAlign = "left";
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body rows
    const tbody = document.createElement("tbody");

    employees.forEach(emp => {
        const row = document.createElement("tr");

        const cells = [
            emp.fullName || "-",
            emp.email || "-",
            emp.phoneNumber || "-",
            emp.gender || "-",
            emp.department || "-",
            emp.id || "-"
        ];

        cells.forEach(cellText => {
            const td = document.createElement("td");
            td.textContent = cellText;
            td.style.border = "1px solid #ccc";
            td.style.padding = "8px";
            row.appendChild(td);
        });

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);
}

async function fetchUserDataWithSubordinates(userId) {
    document.getElementById("recentClocksSpan").innerHTML = "";
    try {
        const response = await fetch("/subordinates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
        });

        console.log("📌 Fetching Admin & Managers for:", userId);
        const data = await response.json();

        if (!data.success) {
            console.error("❌ Error:", data.error);
            return;
        }

        console.log("📌 Subordinates (Managers):", data.subordinates);

        const container = document.getElementById("recentRecs");
        container.innerHTML = "";

        // 🔹 Create Table
        const table = document.createElement("table");
        table.classList.add("manager-table");

        // 🔹 Create Table Header
        const thead = document.createElement("thead");
        thead.innerHTML = `
            <tr>
                <th><button class="sort-btn" onclick="sortTable(0)">Full Name</button></th>
                <th><button class="sort-btn" onclick="sortTable(1)">Email</button></th>
                <th><button class="sort-btn" onclick="sortTable(2)">Phone</button></th>
                <th><button class="sort-btn" onclick="sortTable(3)">Department</button></th>
                <th><button class="sort-btn" onclick="sortTable(4)">Gender</button></th>
                <th><button class="sort-btn" onclick="sortTable(5)">Role</button></th>
                <th><button class="sort-btn" onclick="sortTable(6)">ID</button></th>
                <th>Actions</th>
            </tr>
        `;
        table.appendChild(thead);

        // 🔹 Create Search Bar
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Search by name, department, email, or phone...";
        searchInput.id = "searchInput";
        container.appendChild(searchInput);

        searchInput.addEventListener("input", filterTable); // Listen for input in the search field

        // 🔹 Create Table Body
        const tbody = document.createElement("tbody");

        /*const filteredEmployees = data.employees.filter(employee => {
            const searchTerm = searchInput.value.toLowerCase();
            return (
                employee.fullName.toLowerCase().includes(searchTerm) ||
                employee.email.toLowerCase().includes(searchTerm) ||
                employee.phoneNumber.toLowerCase().includes(searchTerm) ||
                employee.department.toLowerCase().includes(searchTerm)
            );
        });*/

        data.employees.forEach(employee => {
            const row = document.createElement("tr");
            const subordinatesButton = employee.role === "worker" ? "" : `
                <button class="icon-button" title="Subordinates" onclick="fetchManagerSubordinates('${employee.id}', '${employee.fullName}')">
                    <i class="fas fa-users fa-2x"></i>
                </button>
            `;
        
            row.innerHTML = `
                <td>${employee.fullName}</td>
                <td>${employee.email}</td>
                <td>${employee.phoneNumber}</td>
                <td>${employee.department}</td>
                <td>${employee.gender}</td>
                <td>${employee.role}</td>
                <td>${employee.id}</td>
                <td class="action-buttons">
                    <button class="icon-button" title="View Reports" onclick="fetchASubClock('${employee.id}', '${employee.supervisingManagerId || ''}', '${employee.role}', '${employee.fullName}')">
                        <i class="fas fa-file-alt fa-2x"></i>
                    </button>
                    ${subordinatesButton}
                    <button class="icon-button delete-btn" title="Delete" onclick="deleteUser('${employee.id}', '${employee.role}', '${employee.supervisingManagerId || ''}', '${employee.email}')">
                        <i class="fas fa-trash fa-2x"></i>
                    </button>
                </td>
            `;

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        container.appendChild(table);
        document.getElementById("content-wrapper").innerHTML = "<h2 class = 'pageTopic'> View Current Employees</h2>";

    } catch (error) {
        console.error("❌ Fetch error:", error);
    }
}

function sortTable(columnIndex) {
    const table = document.querySelector(".manager-table");
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    const isAscending = table.querySelectorAll("th button")[columnIndex].classList.contains("asc");

    rows.sort((rowA, rowB) => {
        const cellA = rowA.children[columnIndex].textContent.trim().toLowerCase();
        const cellB = rowB.children[columnIndex].textContent.trim().toLowerCase();

        if (cellA < cellB) return isAscending ? -1 : 1;
        if (cellA > cellB) return isAscending ? 1 : -1;
        return 0;
    });

    // Toggle ascending/descending class
    table.querySelectorAll("th button").forEach(button => button.classList.remove("asc", "desc"));
    table.querySelectorAll("th button")[columnIndex].classList.add(isAscending ? "desc" : "asc");

    // Reorder rows
    const tbody = table.querySelector("tbody");
    rows.forEach(row => tbody.appendChild(row));
}

function filterMaps() {
    const searchInput = document.getElementById("mapSearchRecords").value.trim().toLowerCase();
    const userMapSections = document.querySelectorAll(".user-map-section"); // Select all map sections

    userMapSections.forEach(section => {
        // Get the user label (e.g., "User: uid")
        const userLabel = section.querySelector("h3"); // Assuming each section has an <h3> with the user label
        const mapContainer = section.querySelector("div"); // Assuming the map is the first child (div)

        if (userLabel) {
            const labelText = userLabel.textContent.trim().toLowerCase();
            const isVisible = labelText.includes(searchInput); // Check if search input is in the label text

            // Show or hide the entire map section based on the label visibility
            section.style.display = isVisible ? "" : "none";
        }
    });
}

// 🔹 Filter Table Based on Search Input
function filterTable() {
    const searchInput = document.getElementById("searchInput").value.trim().toLowerCase();
    const rows = document.querySelectorAll(".manager-table tbody tr");

    rows.forEach(row => {
        const cells = row.children;
        const isVisible = Array.from(cells).some(cell => cell.textContent.trim().toLowerCase().includes(searchInput));
        row.style.display = isVisible ? "" : "none";
    });
}

function filterRecords() {
    const searchInput = document.getElementById("searchRecords").value.trim().toLowerCase();
    const rows = document.querySelectorAll(".records-table tbody tr");

    rows.forEach(row => {
        const isVisible = Array.from(row.children).some(cell => 
            cell.textContent.trim().toLowerCase().includes(searchInput)
        );
        row.style.display = isVisible ? "" : "none";
    });

    window.fetchedEvents = window.fetchedEvents.filter(event => {
        const values = Object.values(event)
            .map(v => String(v).toLowerCase());
        return values.some(val => val.includes(searchInput));
    });
    console.log("🔍 Filtered Events:", window.fetchedEvents);
}

function showChangePasswordForm() {
    document.getElementById("content-wrapper").innerHTML = "<h2 class='pageTopic'>Change Password</h2>";

    // Create Form in `recentClocks`
    document.getElementById("recentClocks").innerHTML = `
        <form id="passwordChangeForm" class="password-form">
            <label for="oldPassword">Current Password:</label>
            <input type="password" id="oldPassword" required>

            <label for="newPassword">New Password:</label>
            <input type="password" id="newPassword" required>

            <button type="submit" class="btn">Change Password</button>
        </form>
    `;

    const form = document.getElementById("passwordChangeForm");

    if (!form) {
        console.error("❌ Form not found!");
        return;
    }

    console.log("✅ Password Change Form Loaded - Attaching Event Listener");

    form.addEventListener("submit", async (event) => {
        event.preventDefault(); // 🔥 Stops page from refreshing

        console.log("🔹 Submit button clicked!");

        const oldPassword = document.getElementById("oldPassword").value;
        const newPassword = document.getElementById("newPassword").value;

        if (!oldPassword || !newPassword) {
            alert("❌ Both fields are required!");
            return;
        }

        try {
            // 🔥 Re-authenticate user with existing credentials
            const credential = firebase.auth.EmailAuthProvider.credential(userCreds.email, oldPassword);
            await firebase.auth().currentUser.reauthenticateWithCredential(credential);
            console.log("✅ User re-authenticated!");

            // 🔥 Change Password
            await firebase.auth().currentUser.updatePassword(newPassword);
            console.log("✅ Password changed successfully!");

            alert("✅ Password changed successfully!");
            form.reset();
        } catch (error) {
            console.error("❌ Password Change Error:", error);
            alert(`❌ ${error.message}`);
        }
    });
}

function displayUserPlan() {
    if (!userData || !userData.plan || !userData.amount) {
        console.error("❌ User data is missing.");
        return;
    }

    const planContainer = document.getElementById("recentClocks");
    if (!planContainer) {
        console.error("❌ Plan display container not found.");
        return;
    }

    document.getElementById("content-wrapper").innerHTML = "<h2 class = 'pageTopic'> Plan </h2>";
    planContainer.innerHTML = `
        <div id = "planDisplay" style="border: 2px solid #ccc; padding: 15px; border-radius: 10px; text-align: center;">
            <h3>Current Plan: <span style="color: blue;">${userData.plan}</span></h3>
            <p>Number of Employess: <strong>${userData.number}</strong></p>
            <button id="upgradeButton" style="background-color: green; color: white; padding: 10px 15px; border: none; border-radius: 5px; cursor: pointer;">Upgrade</button>
        </div>
    `;

    // Handle Upgrade Button Click
    document.getElementById("upgradeButton").addEventListener("click", function () {
        console.log("upgrade button clicked");
        displayPlans();
    });
};

function displayPlans() {
    document.getElementById("recentClocks").innerHTML = `
        <div class="numberDiv mx-auto border border-primary p-5 m-5" style="max-width: 400px;border-radius: 5px;">
            <label for="empNumber">How many Employees?</label>
            <hr class="m-3 mx-auto" style="height: 3px; width: 100%;">
            <input type="number" class="form-control" id="empNumber" placeholder="Enter Number" required>
            <button id = "empButton" type="button" class="mt-4 button form-control bg-primary text-white">Confirm</button>
        </div>

        <div class="container mt-auto" id="plan-container" style="display: none;">
            <h1>Choose Your Plan</h1>
            <div class="d-flex justify-content-evenly">
                <div class="plan m-3">
                    <img class="img-fluid w-50" src="image/price-tag.png" alt="Silver Plan">
                    <h2>Silver</h2>
                    <p>Silver Plan</p>
                    <p class="price">$<span class="priceSpan">199</span> / employee</p>
                    <button class="pay-btn">Pay now $<span class="pay-btnSpan">1990</span></button>
                    <h5>What's included</h5>
                    <ul class="features">
                        <li class="excluded">Task System</li>
                        <li class="excluded">Product & Ordering</li>
                        <li class="excluded">Custom Forms</li>
                        <li class="excluded">Notice Board</li>
                        <li class="included">Expense Management</li>
                        <li class="included">Leave Management</li>
                        <li class="included">Document Management</li>
                    </ul>
                </div>
                <div class="plan m-3">
                    <img class="img-fluid w-50" src="image/price-tag.png" alt="Gold Plan">
                    <h2>Gold</h2>
                    <p>Gold Plan</p>
                    <p class="price">$<span class="priceSpan">499</span> / employee</p>
                    <button class="pay-btn">Pay now $<span class="pay-btnSpan">4990</span></button>
                    <h5>What's included</h5>
                    <ul class="features">
                        <li class="excluded">Task System</li>
                        <li class="excluded">Product & Ordering</li>
                        <li class="excluded">Custom Forms</li>
                        <li class="excluded">Notice Board</li>
                        <li class="included">Expense Management</li>
                        <li class="included">Leave Management</li>
                        <li class="included">Document Management</li>
                    </ul>
                </div>
                <div class="plan m-3">
                    <img class="img-fluid w-50" src="image/price-tag.png" alt="Platinum Plan">
                    <h2>Platinum</h2>
                    <p>Platinum Plan</p>
                    <p class="price">$<span class="priceSpan">999</span> / employee</p>
                    <button class="pay-btn">Pay now $<span class="pay-btnSpan">9990</span></button>
                    <h5>What's included</h5>
                    <ul class="features">
                        <li class="excluded">Task System</li>
                        <li class="excluded">Product & Ordering</li>
                        <li class="excluded">Custom Forms</li>
                        <li class="excluded">Notice Board</li>
                        <li class="included">Expense Management</li>
                        <li class="included">Leave Management</li>
                        <li class="included">Document Management</li>
                    </ul>
                </div>
                <div class="plan m-3">
                    <img class="img-fluid w-50" src="image/price-tag.png" alt="Diamond Plan">
                    <h2>Diamond</h2>
                    <p>Diamond Plan</p>
                    <p class="price">$<span class="priceSpan">1999</span> / employee</p>
                    <button class="pay-btn">Pay now $<span class="pay-btnSpan">19990</span></button>
                    <h5>What's included</h5>
                    <ul class="features">
                        <li class="excluded">Task System</li>
                        <li class="excluded">Product & Ordering</li>
                        <li class="excluded">Custom Forms</li>
                        <li class="excluded">Notice Board</li>
                        <li class="included">Expense Management</li>
                        <li class="included">Leave Management</li>
                        <li class="included">Document Management</li>
                    </ul>
                </div>
            </div>
        </div>
    `
    let empNumber;
    document.getElementById("empButton").addEventListener("click", () => {
        empNumber = document.getElementById("empNumber").value;

        if (empNumber !== "") {
            document.getElementById("plan-container").style.display = "block";     
        }
    
        let planPrices = document.getElementsByClassName("priceSpan");
        let totalAmount = [];

        // Convert HTMLCollection to an array before using forEach
        Array.from(planPrices).forEach((plan, index) => {
            totalAmount[index] = empNumber * Number(plan.textContent);
        });

        const payNowSpans = document.getElementsByClassName("pay-btnSpan");
        Array.from(payNowSpans).forEach((span, index) => {
            span.textContent = totalAmount[index];
        });
        console.log(totalAmount);
    })

    document.querySelectorAll(".pay-btn").forEach(button => {
        button.addEventListener("click", function () {
            let planDiv = this.closest(".plan"); // Get the parent .plan div
            let planName = planDiv.querySelector("h2").textContent; // Extract plan name
            let amount = planDiv.querySelector(".pay-btnSpan").textContent; // Extract amount from pay-btnSpan
            
            processUpgrade(planName, amount, empNumber);
        });
    });    
}

async function processUpgrade(plan, amount, number) {
    if (!userData) {
        alert("Session expired! Please sign up again.");
        window.location.href = "/";
        return;
    }

    try {
        let response = await fetch("/payment/upgrade-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: userData.email,
                plan,
                amount,
                empNumber: number
            }),
        });

        let data = await response.json();
        if (data.paymentLink) {
            window.location.href = data.paymentLink;
        } else {
            alert("Payment failed to start!");
        }
    } catch (error) {
        console.error("Upgrade error:", error);
    }
}

async function deleteUser(userId, role, supervisorId = "", email) {
    const registrarId = userData.companyName; // Assuming `userData` is globally available

    // 🔴 Show confirmation modal
    const isConfirmed = confirm("⚠️ Are you sure you want to delete this user? This action cannot be undone.");
    if (!isConfirmed) {
        console.log("❌ Deletion canceled by user.");
        return; // Stop execution if the user cancels
    }

    const deleteData = {
        userID: userId,
        role: role,
        registrarId: registrarId,
        email: email
    };

    if (role === "worker") {
        deleteData.supervisingManagerID = supervisorId;
    }
    
    try {
        const response = await fetch("/subordinates/delete", { 
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(deleteData),
        });

        const result = await response.json();

        if (result.error) {
            console.error("❌ Error:", result.error);
            return;
        }

        console.log("✅ User Deleted Successfully:", result);
        alert("✅ User deleted successfully!"); 
        fetchUserDataWithSubordinates(userData.companyName);
        
    } catch (error) {
        console.error("❌ Error deleting user account:", error);
        alert("❌ Error deleting user. Please try again.");
    }
}

async function deleteAccount() {

    const isConfirmed = confirm("⚠️ Are you sure you want to delete your Account? This action cannot be undone.");
    if (!isConfirmed) {
        console.log("❌ Deletion canceled by user.");
        return; // Stop execution if the user cancels
    }

    const userId = userData.companyName;
    const email = userData.email;

    if (!userId || !email) {
        alert("❌ Missing user information.");
        return;
    }

    try {
        const res = await fetch('/subordinates/delete-account', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userId, email }),
        });

        const data = await res.json();
        if (res.ok) {
            alert(`✅ ${data.message}`);
            window.location.href = "/";
        } else {
            alert(`❌ ${data.error}`);
        }
    } catch (err) {
        alert(`❌ Network error: ${err.message}`);
    }
};

async function fetchFilteredEvents(startDate, endDate, name = "") {
    if (!startDate) {
       displayRecords(window.fetchedEvents);
        return;
    } else {
        try {
            let requestBody = { userID: userData.companyName };

            if (startDate || endDate) {
                if (startDate && endDate && startDate === endDate) {
                    requestBody.dateQuery = { startDate };
                } else {
                    requestBody.dateQuery = { startDate, endDate };
                }
            
            if (name.trim() !== "") {
                requestBody.name = name;
            }

            console.log("📅 Searching with:", requestBody);

            const response = await fetch("/records/search-clock-events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            });

            const data = await response.json();
            console.log("📜 Filtered Clock Events Response:", data);

            if (!data.success || !Array.isArray(data.clockEvents)) {
                console.error("❌ Invalid response format:", data);
                return [];
            }

            window.fetchedEvents = data.clockEvents;

            displayRecords(data.clockEvents, name);
            }

        } catch (error) {
            console.error("❌ Error fetching filtered clock events:", error);
            return [];
        }
    }
}

async function fetchFilteredMaps(startDate, endDate) {
    try {
        // Prepare the request body
        let requestBody = { id: userData.companyName };

        // Add date filters
        if (startDate || endDate) {
            if (startDate && endDate && startDate === endDate) {
                requestBody.dateQuery = { startDate };
            } else {
                requestBody.dateQuery = { startDate, endDate };
            }
        }


        console.log("🗺️ Searching maps with:", requestBody);

        const response = await fetch("/records/search-map-dates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        });

        const data = await response.json();
        console.log("📍 Filtered Map Events Response:", data.mapSearhResults);

        if (!data.success || !Array.isArray(data.mapSearhResults)) {
            console.error("❌ Invalid map response format:", data);
            return [];
        }
        
        data.mapSearhResults.forEach(entry => {
            updateSearchTimeline(entry.displayName, entry.latitude, entry.longitude, entry.timestamp);
        });

        generateUserMaps(searchedTimelines);
    } catch (error) {
        console.error("❌ Error fetching map events:", error);
        return [];
    }
}

function filterEvents(query) {
    const filteredEvents = window.fetchedEvents.filter(event =>  
        event.name?.toLowerCase().includes(query.toLowerCase()) // 🔹 Filter by event ID
    );

    displayRecords(filteredEvents); 
}

function displayRecords(events, name = "") {
    document.getElementById("content-wrapper").innerHTML = "<h2 class='pageTopic'>Records</h2>";
    const container = document.getElementById("recentRecs");
    container.innerHTML = ""; 
    document.getElementById("recentClocksSpan").innerHTML = '';

    const controlsContainer = document.createElement("div");
    controlsContainer.classList.add("m-3");
    controlsContainer.style.display = "flex";
    controlsContainer.style.justifyContent = "space-evenly";
    controlsContainer.style.alignItems = "center";
    controlsContainer.style.marginBottom = "20px";

    const downloadBtn = document.createElement("button");
    downloadBtn.innerText = "Download CSV";
    downloadBtn.id = "csvBtn";
    downloadBtn.onclick = () => downloadCSV(userId = "");
    controlsContainer.appendChild(downloadBtn);

    const downloadPDFBtn = document.createElement("button");
    downloadPDFBtn.id = "pdfBtn";
    downloadPDFBtn.innerText = "Download PDF";
    downloadPDFBtn.onclick = () => downloadPDF(events);
    controlsContainer.appendChild(downloadPDFBtn);

    const fieldset = document.createElement("fieldset");
    fieldset.style.border = "2px solid #ccc";
    fieldset.style.padding = "5px";
    fieldset.style.borderRadius = "5px";

    const dateFilterContainer = document.createElement("div");
    dateFilterContainer.id = "dateContainer";
    dateFilterContainer.style.display = "flex";
    dateFilterContainer.style.alignItems = "center";
    dateFilterContainer.style.gap = "10px";

    const dateLegend = document.createElement("legend");
    dateLegend.textContent = "Get records with the date search";
    dateLegend.id = "dateLegend";

    const startDateLabel = document.createElement("label");
    startDateLabel.innerText = "Start Date:";
    startDateLabel.style.fontWeight = "bold";

    const startDateInput = document.createElement("input");
    startDateInput.type = "date";
    startDateInput.id = "startDate";
    startDateInput.style.padding = "5px";

    const endDateLabel = document.createElement("label");
    endDateLabel.innerText = "End Date:";
    endDateLabel.style.fontWeight = "bold";

    const endDateInput = document.createElement("input");
    endDateInput.type = "date";
    endDateInput.id = "endDate";
    endDateInput.style.padding = "5px";

    const arrowButton = document.createElement("button");
    arrowButton.classList.add("dateGo");
    arrowButton.innerHTML = "&#8594;"; // Right arrow symbol
    arrowButton.style.fontSize = "20px";
    arrowButton.style.cursor = "pointer";
    arrowButton.onclick = async () => {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        fetchFilteredEvents(startDate, endDate, name); 
    };

    dateFilterContainer.appendChild(dateLegend);
    dateFilterContainer.appendChild(startDateLabel);
    dateFilterContainer.appendChild(startDateInput);
    dateFilterContainer.appendChild(endDateLabel);
    dateFilterContainer.appendChild(endDateInput);
    dateFilterContainer.appendChild(arrowButton);

    // Wrap everything in the fieldset
    fieldset.appendChild(dateLegend);
    fieldset.appendChild(dateFilterContainer);

    controlsContainer.appendChild(fieldset);

    const searchFieldset = document.createElement("fieldset");
    searchFieldset.style.border = "2px solid #ccc";
    searchFieldset.style.padding = "5px";
    searchFieldset.style.borderRadius = "5px";
    const searchBarContainer = document.createElement("div");
    searchBarContainer.style.display = "flex";
    searchBarContainer.style.alignItems = "center";
    searchBarContainer.style.gap = "1px";

    const searchLegend = document.createElement("legend");
    searchLegend.textContent = "filter records with the search bar";
    searchLegend.id = "dateLegend";

    const searchBar = document.createElement("input");
    searchBar.type = "text";
    searchBar.id = "searchRecords";
    searchBar.placeholder = "Search";
    searchBar.style.padding = "5px";
    searchBar.addEventListener("input", filterRecords);

    searchBarContainer.appendChild(searchBar);   
    searchFieldset.appendChild(searchLegend);
    searchFieldset.appendChild(searchBarContainer);

    controlsContainer.appendChild(searchFieldset);
    
    container.appendChild(controlsContainer);

    const table = document.createElement("table");
    table.classList.add("records-table");
    table.innerHTML = `
        <thead>
            <tr>
                <th>Name</th>
                <th>Department</th>
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
        console.log("department:", event.department);
        const clockInTime = event.clockInTime?._seconds
            ? new Date(event.clockInTime._seconds * 1000).toLocaleString("en-GB")
            : "N/A";

        const clockOutTime = event.clockOutTime?._seconds
            ? new Date(event.clockOutTime._seconds * 1000).toLocaleString("en-GB")
            : "N/A";

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${name ? name : event.name}</td>
            <td>${event.department}</td>
            <td>${clockInTime}</td>
            <td>${event.clockInLocation || "N/A"}</td>
            <td>${event.clockInComment || "N/A"}</td>
            <td>${clockOutTime}</td>
            <td>${event.clockOutLocation || "N/A"}</td>
            <td>${event.clockOutComment || "N/A"}</td>
        `;
        tbody.appendChild(row);
    });

    container.appendChild(table);
    if (name) {
        searchFieldset.style.display = "none";
    }
}

function displayRecentCheckins(events) {
    const tbody = document.querySelector(".recentClockingsDisplay table tbody"); 
    if (!tbody) {
        return;
    }

    // Clear previous rows before adding new ones
    tbody.innerHTML = "";

    events.forEach(event => {
        const clockInTime = event.clockInTime?._seconds
            ? new Date(event.clockInTime._seconds * 1000).toLocaleString("en-GB")
            : "N/A";

        const clockOutTime = event.clockOutTime?._seconds
            ? new Date(event.clockOutTime._seconds * 1000).toLocaleString("en-GB")
            : "N/A";

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${event.name || "Unknown"}</td>
            <td>${clockInTime}</td>
            <td>${event.clockInLocation || "N/A"}</td>
            <td>${event.clockInComment || "N/A"}</td>
            <td>${clockOutTime}</td>
            <td>${event.clockOutLocation || "N/A"}</td>
            <td>${event.clockOutComment || "N/A"}</td>
        `;
        tbody.appendChild(row);
    });
}

async function fetchClockEvents(userId = "") {
    try {
        const response = await fetch("/records/get-clock-events", {  
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userID: userData.companyName }), 
        });

        const data = await response.json();
        console.log("📜 Clock Events Response:", data);

        // ✅ Validate response
        if (!data.success || !Array.isArray(data.clockEvents)) {
            console.error("❌ Invalid response format:", data);
            return;
        }

        const events = data.clockEvents;

        // ✅ Sort by `lastClockInTime`
        events.sort((a, b) => (a.clockInTime?._seconds || 0) - (b.clockInTime?._seconds || 0));
        window.fetchedEvents = events;

        displayRecords(events);
        
    } catch (error) {
        console.error("❌ Error fetching clock events:", error);
    }
}

function downloadCSV(username = "") {
    if (!window.fetchedEvents || window.fetchedEvents.length === 0) {
        alert("No data to download.");
        return;
    }

    let csvContent = `"Name","Clock In Time","Clock In Location","Clock In Comment","Clock Out Time","Clock Out Location","Clock Out Comment"\n`;

    window.fetchedEvents.forEach(event => {
        let clockInTime = event.clockInTime?._seconds
            ? new Date(event.clockInTime._seconds * 1000).toLocaleString("en-GB")
            : "N/A";

        let clockOutTime = event.clockOutTime?._seconds
            ? new Date(event.clockOutTime._seconds * 1000).toLocaleString("en-GB")
            : "N/A";

        let row = [
            `"${event.name}"`,
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

function downloadPDF(username = "") {
    if (!window.fetchedEvents || window.fetchedEvents.length === 0) {
        alert("No data to download.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(16);
    doc.text("Clock Events", 14, 16);

    // Add table headers
    doc.setFontSize(10);
    const headers = ["Name", "Clock In Time", "Clock In Location", "Clock In Comment", "Clock Out Time", "Clock Out Location", "Clock Out Comment"];
    let yPosition = 30;
    
    // Use autoTable plugin to create the table
    doc.autoTable({
        head: [headers],
        body: window.fetchedEvents.map(event => {
            let clockInTime = event.clockInTime?._seconds
                ? new Date(event.clockInTime._seconds * 1000).toLocaleString("en-GB")
                : "N/A";

            let clockOutTime = event.clockOutTime?._seconds
                ? new Date(event.clockOutTime._seconds * 1000).toLocaleString("en-GB")
                : "N/A";

            return [
                event.name, // User's name
                clockInTime,
                event.clockInLocation || "N/A",
                event.clockInComment || "N/A",
                clockOutTime,
                event.clockOutLocation || "N/A",
                event.clockOutComment || "N/A"
            ];
        }),
        startY: yPosition,
        theme: 'grid',
        margin: { top: 10 },
        didDrawPage: function (data) {
            yPosition = data.cursor.y + 10; // Update the y position after the header and table
        }
    });

    // Save the PDF file
    doc.save("clock_events.pdf");
}

async function fetchASubClock(employeeId, supervisorId, role, name) {
    try {
        const requestBody = {
            userID: userData.companyName,  // ✅ Use global userData.companyName
            id: employeeId,
            role
        };

        if (role === "worker" && supervisorId) {
            requestBody.supervisorID = supervisorId; // ✅ Only add supervisorID if needed
        }

        console.log("🔍 Fetching clock events with:", requestBody);

        const response = await fetch("/records/get-sub-events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        });

        const data = await response.json();
        console.log("📜 Sub Clock Events Response:", data);

        if (!data.success) {
            console.error("❌ Error fetching sub clock events:", data.message);
            return;
        }

        // ✅ Store in a global variable for filtering later
        window.fetchedEvents = data.clockEvents;

        console.log("fetched sub:", data.clockEvents);
        displayRecords(data.clockEvents,name);

    } catch (error) {
        console.error("❌ Fetch error:", error);
    }
}

async function fetchRecentEvents() {
    try {
        const response = await fetch("/records/get-clock-events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userID: userData.companyName,limit: 5 }),
        });

        const data = await response.json();
        console.log("📜 Clock Events Response:", data);

        // ✅ Validate response
        if (!data.success || !Array.isArray(data.clockEvents)) {
            console.error("❌ Invalid response format:", data);
            return;
        }

        let events = data.clockEvents;

        const today = new Date();
        today.setHours(0, 0, 0, 0); // start of today
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1); // start of tomorrow

        // 🔹 Filter events where clockInTime is today
        events = events.filter(event => {
            const clockIn = event.clockInTime?._seconds
                ? new Date(event.clockInTime._seconds * 1000)
                : null;

            return clockIn && clockIn >= today && clockIn < tomorrow;
        });

        // ✅ Sort by `lastClockInTime` (Descending: Newest First)
        events.sort((a, b) => 
            (b.lastClockInTime?._seconds || 0) - (a.lastClockInTime?._seconds || 0)
        );

        displayRecentCheckins(events);
    } catch (error) {
        console.error("❌ Error fetching clock events:", error);
    }
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
    } else {
        badge.style.backgroundColor = "blue";
        badge.textContent = 0;
        
        // Remove Clear All button if it exists
        const clearAllBtn = document.getElementById("clearAllBtn");
        if (clearAllBtn) clearAllBtn.remove();
    }
}

function displayNotificationsFromExt() {
    const notificationsBar = document.getElementById("notificationsBar");

    if (!notificationsBar) {
        console.error("❌ notificationsBar element not found.");
        return;
    }

    let table = notificationsBar.querySelector("table");
    if (!table) {
        table = document.createElement("table");
        table.innerHTML = "<tbody></tbody>";
        notificationsBar.appendChild(table);
    }

    // Clear previous rows
    table.querySelector("tbody").innerHTML = "";

    // Show only the first 10 notifications
    const visibleNotifications = notificationsExt.slice().reverse().slice(0, 5);
    const remaining = notificationsExt.length - visibleNotifications.length;

    visibleNotifications.forEach((message) => {
        const row = document.createElement("tr");
        row.classList.add("notificationBarRow");
        row.id = message.id;

        const messageCell = document.createElement("td");
        messageCell.textContent = message.message;

        const buttonCell = document.createElement("td");
        buttonCell.innerHTML = `<button class="close-btn" style="background-color: white; border:none">❌</button>`;
        buttonCell.querySelector(".close-btn").addEventListener("click", (event) => {
            row.remove();
            event.stopPropagation();

            if (message.id) {
                socket.emit("delete_notification", { notificationId: message.id });
            }

            updateBadgeCount();
        });

        row.appendChild(messageCell);
        row.appendChild(buttonCell);
        table.querySelector("tbody").appendChild(row);
    });

    // Show ellipsis if there are more than 10
    if (remaining > 0) {
        const dotsRow = document.createElement("tr");
        const dotsCell = document.createElement("td");
        dotsCell.colSpan = 2;
        dotsCell.style.textAlign = "center";
        dotsCell.textContent = "...";
        dotsRow.appendChild(dotsCell);
        table.querySelector("tbody").appendChild(dotsRow);

        // Add "View X more notifications" link
        let viewMore = document.createElement("p");
        viewMore.id = "viewMoreNotifications";
        viewMore.style.cursor = "pointer";
        viewMore.style.color = "blue";
        viewMore.style.textAlign = "center";
        viewMore.style.marginTop = "5px";
        viewMore.textContent = `View ${remaining} more notification${remaining > 1 ? 's' : ''}`;

        // Remove existing viewMore if any
        const existingMore = document.getElementById("viewMoreNotifications");
        if (existingMore) existingMore.remove();

        // Append and add event listener
        notificationsBar.appendChild(viewMore);
        viewMore.addEventListener("click", () => {
            displayNotificationsList(); // Call your existing full-display function
        });
    }

    // Handle Clear All button
    let clearAllBtn = document.getElementById("clearAllBtn");
    if (!clearAllBtn) {
        clearAllBtn = document.createElement("button");
        clearAllBtn.classList.add("clearBtn");
        clearAllBtn.id = "clearAllBtn";
        clearAllBtn.textContent = "Clear All";
        clearAllBtn.style.marginTop = "10px";
        clearAllBtn.style.display = "block";
        notificationsBar.appendChild(clearAllBtn);

        clearAllBtn.addEventListener("click", () => {
            table.querySelector("tbody").innerHTML = "";
            const viewMore = document.getElementById("viewMoreNotifications");
            if (viewMore) viewMore.remove();
            socket.emit("delete_all_notifications");
            notificationsExt = [];
            clearAllBtn.remove();
            updateBadgeCount();
        });
    }

    updateBadgeCount();
}

function displayNotificationsList() {
    const notificationBarRows = document.querySelectorAll(".notificationBarRow");
    const container = document.getElementById("recentRecs");
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

    let clearAllBtn = document.getElementById("clearAllNotifications");
    if (!clearAllBtn) {
        clearAllBtn = document.createElement("button");
        clearAllBtn.classList.add("clearBtn");
        clearAllBtn.id = "clearAllNotifications";
        clearAllBtn.textContent = "Clear All";
        clearAllBtn.style.marginTop = "10px";
        clearAllBtn.style.display = "block";
        notificationsWrapper.appendChild(clearAllBtn);

        clearAllBtn.addEventListener("click", () => {
            notificationsWrapper.innerHTML = "";
            socket.emit("delete_all_notifications");
            notificationsExt = [];
            updateBadgeCount();
        });
    }
    const reversedNotifications = [...notificationsExt].reverse(); 

    reversedNotifications.forEach((message, index) => {
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
            
            socket.emit('delete_notification', { notificationId: message.id } );            
    
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

    document.getElementById("content-wrapper").innerHTML = "<h2 class = 'pageTopic'>Notifications</h2>";
}


let notificationsExt = [];

document.addEventListener("DOMContentLoaded", async () => {
    userCreds = JSON.parse(sessionStorage.getItem("userCreds")) || {};
    userData = JSON.parse(sessionStorage.getItem("userData")) || {};

    console.log(userCreds);

    const token = sessionStorage.getItem("token");
    if (token) {
        socket = io({ auth: { token: token, adminID: userData.companyName } });

        socket.on("connect", () => {
            console.log("🔌 Connected to Socket.IO with token:");
        });

        socket.on("private_message", (data) => {
            console.log(`📩 New private message from ${data.sender}: ${data.message}`);
            console.log(data.message);
        });

        socket.on("previousMessages", (messages) => {
            console.log("📩 Loading previous messages...");
            messages.forEach((message) => {
                console.log(`📩 Previous message from ${message.sender}: ${message.message}, ${message.id}`);
                if (!notificationsExt.some(existingMessage => existingMessage.id === message.id)) notificationsExt.push(message);
                displayNotificationsFromExt();
            });
        });

        socket.on("user_location", (data) => {
            const uid = data.user; // 👈 Use the name from data as UID
            const locations = data.locations;
        
            console.log("📍 Received live location from", uid);
        
            const latest = locations?.[locations.length - 1]; // Safely get latest location
        
            if (latest) {
                console.log("   Latitude:", latest.latitude);
                console.log("   Longitude:", latest.longitude);
                console.log("   Timestamp:", latest.timestamp);
                showLocationOnMap(latest.latitude, latest.longitude, uid, latest.timestamp); 
            } else {
                console.log("⚠️ No location data received.");
            }
        
            // ✅ Loop through and update user's timeline
            if (locations && locations.length) {
                locations.forEach((loc) => {
                    updateUserTimeline(uid, loc.latitude, loc.longitude, loc.timestamp);
                });
            }
        });

        socket.on("onlineCheck", (data) => {  
            console.log("onlineList:", data);
            onlineEmployees = data;
            document.getElementById("onlineCount").textContent = onlineEmployees.length;
            console.log("online List updated :", data);
        });
        
        socket.on("disconnect", () => {
            console.log("❌ Disconnected from server.");
            sessionStorage.removeItem('isConnected');
            logout();
        });
        
        socket.on("connect_error", (err) => {
            console.error("❌ Socket connection error:", err.message);
            if (err.message === "Authentication error") {
                alert("Session expired. Logging you out.");
                logout(); // Custom function to clear storage/cookies/etc.
                window.location.href = "/";
            }
        });

        socket.on("multiple_login_refusal", (data) => {
            alert(data.message); 
        });
        
    } else {
        console.error("❌ No token found in sessionStorage.");
    }

    dashBoard();

    document.getElementById("profileBtn").addEventListener("click", function (event) {
        event.preventDefault(); 
            
        document.getElementById("content-wrapper").innerHTML = "<h2 class = 'pageTopic'> Profile</h2>";
        document.getElementById("recentClocks").innerHTML = `
            <p><strong>Name:</strong> ${userCreds.displayName || "N/A"}</p>
            <p><strong>Email:</strong> ${userCreds.email || "N/A"}</p>
            <p><strong>Phone Number:</strong> ${userData.phoneNumber || "N/A"}</p>
            <p><strong>Company Name:</strong> ${userData.companyName || "N/A"}</p>
            <p><strong>No. of Employees:</strong> ${userData.number || "N/A"}</p>
            <p><strong>Gender:</strong> ${userData.gender || "N/A"}</p>
            <p><strong>Role:</strong> ${userData.role || "N/A"}</p>
        `;
    });

    document.getElementById("profileContainer").addEventListener("click", () => {
        const dropdown = document.getElementById("profileDropdown");
        dropdown.classList.toggle("show");
    });

    document.getElementById("logoutBtn").addEventListener("click", logout);;

    originalHtml = document.body.innerHTML;

    document.getElementById("dashboardNav").addEventListener("click",(e)=>{
        e.preventDefault();
        document.body.innerHTML = originalHtml;
        dashBoard()
        attachEventListeners();
    })

    document.getElementById("addNewEmployee").addEventListener("click", function(event) {
        document.getElementById("content-wrapper").innerHTML = "<h2 class = 'pageTopic'> Add a new Employee</h2>"
        event.preventDefault();
        createAdminSignupForm(); 
    });

    document.getElementById("employeesDisplay").addEventListener("click", (e)=> {
        e.preventDefault();
        fetchUserDataWithSubordinates(userData.companyName);
    });

    document.getElementById("changePasswordBtn").addEventListener("click", () => {
        // Set Page Title
        document.getElementById("content-wrapper").innerHTML = "<h2 class='pageTopic'>Change Password</h2>";
    
        // Create Form in `recentClocks`
        document.getElementById("recentClocks").innerHTML = `
            <form id="passwordChangeForm" class="password-form">
                <label for="oldPassword">Current Password:</label>
                <input type="password" id="oldPassword" required>
    
                <label for="newPassword">New Password:</label>
                <input type="password" id="newPassword" required>
    
                <button type="submit" class="btn">Change Password</button>
            </form>
        `;
    
        // Handle Password Change on Submit
        document.getElementById("changePasswordBtn").addEventListener("submit", async (event) => {
            event.preventDefault(); // Prevent page refresh
            showChangePasswordForm();            
        });
    });

    document.getElementById("changePasswordBtn").addEventListener("click", () => {
        showChangePasswordForm();
     });

     document.getElementById("userPlan").addEventListener("click", () => {
        displayUserPlan();
     });

     document.getElementById("records").addEventListener("click", () => {
        fetchClockEvents();
     });

     document.getElementById("notificationsContainer").addEventListener("click", () => {
        const noteDropdown = document.getElementById("notificationsDropdown");
        noteDropdown.classList.toggle("show"); // Toggle class instead of modifying `display`
    });

    document.getElementById("notificationsMenu").addEventListener("click", displayNotificationsList);
    
    setInterval(() => fetchRecentEvents(userId = ""), 7000) ; 
    
    document.getElementById("liveLocation").addEventListener("click", (event)=> {
        event.preventDefault();
        console.log("live location clicked");
        createMapInRecentClocks();
    });

    document.getElementById("timelineDisplay").addEventListener("click", () => generateUserMaps(userTimelines));

    setInterval(() => fetchTodaysClockEvents(), 5000 );

    document.getElementById("onlineDisplay").addEventListener("click", () => displayCurrentRecs(onlineEmployees, "Employees Online"));

    document.getElementById("clockInDisplay").addEventListener("click", () => displayCurrentClocks(clockedInEmployees, "Clocked In"));

    document.getElementById("clockOutDisplay").addEventListener("click", () => displayCurrentClocks(clockedOutEmployees, "Clocked Out"));
}); //DOM content loaded
    

//attach event listeners
function attachEventListeners(){ 
    document.getElementById("profileBtn").addEventListener("click", function (event) {
        event.preventDefault(); // Prevent default link behavior
    
        // Simulate fetching user data (Replace with API call if needed)
        const userCreds = JSON.parse(sessionStorage.getItem("userCreds")) || {};
        const userData = JSON.parse(sessionStorage.getItem("userData")) || {};
    
        document.getElementById("content-wrapper").innerHTML = "<h2 class = 'pageTopic'> Profile</h2>";
        document.getElementById("recentClocks").innerHTML = `
            <p><strong>Name:</strong> ${userCreds.displayName || "N/A"}</p>
            <p><strong>Email:</strong> ${userCreds.email || "N/A"}</p>
            <p><strong>Phone Number:</strong> ${userData.phoneNumber || "N/A"}</p>
            <p><strong>Company Name:</strong> ${userData.companyName || "N/A"}</p>
            <p><strong>No. of Employees:</strong> ${userData.number || "N/A"}</p>
            <p><strong>Gender:</strong> ${userData.gender || "N/A"}</p>
            <p><strong>Role:</strong> ${userData.role || "N/A"}</p>
        `
    });

    document.getElementById("profileContainer").addEventListener("click", () => {
        const dropdown = document.getElementById("profileDropdown");
        dropdown.classList.toggle("show"); // Toggle class instead of modifying `display`
    });

    document.getElementById("notificationsContainer").addEventListener("click", () => {
        const noteDropdown = document.getElementById("notificationsDropdown");
        noteDropdown.classList.toggle("show"); // Toggle class instead of modifying `display`
    });
    

    document.getElementById("logoutBtn").addEventListener("click", logout);

    document.getElementById("dashboardNav").addEventListener("click",(e)=>{
        e.preventDefault();
        document.body.innerHTML = originalHtml;
        dashBoard()
        attachEventListeners();
    })

    
    displayNotificationsFromExt();

    document.getElementById("addNewEmployee").addEventListener("click", function(event) {
        document.getElementById("content-wrapper").innerHTML = "<h2 class = 'pageTopic'> Add a new Employee</h2>"
        event.preventDefault();
        createAdminSignupForm(); 
    });

    document.getElementById("employeesDisplay").addEventListener("click", (e)=> {
        e.preventDefault();
        fetchUserDataWithSubordinates(userData.companyName);
    });

    document.getElementById("changePasswordBtn").addEventListener("submit", async (event) => {
        event.preventDefault(); // Prevent page refresh
        showChangePasswordForm();            
    });

    document.getElementById("changePasswordBtn").addEventListener("click", () => {
        showChangePasswordForm();
     });

     document.getElementById("userPlan").addEventListener("click", () => {
        displayUserPlan();
     });

     document.getElementById("records").addEventListener("click", () => {
        fetchClockEvents();
     });

     
     document.getElementById("notificationsMenu").addEventListener("click",displayNotificationsList);
     fetchRecentEvents(userId = "") ;

     document.getElementById("liveLocation").addEventListener("click", (event)=> {
        event.preventDefault();
        console.log("live location clicked");
        createMapInRecentClocks();
    });

    document.getElementById("timelineDisplay").addEventListener("click", () => generateUserMaps(userTimelines));
    fetchTodaysClockEvents();

    document.getElementById("onlineDisplay").addEventListener("click", () => displayCurrentRecs(onlineEmployees, "Employees Online"));

    document.getElementById("clockInDisplay").addEventListener("click", () => displayCurrentClocks(clockedInEmployees, "Clocked In", 'clockins'));

    document.getElementById("clockOutDisplay").addEventListener("click", () => displayCurrentClocks(clockedOutEmployees, "Clocked Out", 'clockouts'));

    document.getElementById("onlineCount").textContent = onlineEmployees.length ;

}// attach Listeners

window.addEventListener("pageshow", function (event) {
    // Check if the user is logged in (sessionStorage should have userCreds)
    const isLoggedIn = sessionStorage.getItem("userCreds");

    if (!isLoggedIn && (event.persisted || (window.performance && window.performance.navigation.type === 2))) {
        // If user is NOT logged in and tries to go back, redirect to login
        window.location.href = "/";
    }
});
