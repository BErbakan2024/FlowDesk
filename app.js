// Firebase configuration containing live project credentials
const firebaseConfig = {
    apiKey: "AIzaSyBULevJdG_T3I_iCTKSlRTPVPSNCa1Un8I",
    authDomain: "sirketicihaberlesme-647b7.firebaseapp.com",
    projectId: "sirketicihaberlesme-647b7",
    storageBucket: "sirketicihaberlesme-647b7.firebasestorage.app",
    messagingSenderId: "328315719310",
    appId: "1:328315719310:web:a77d9b7d203b32a3be43df",
    measurementId: "G-6HV2PNMQCX"
};

// ====================================================================

// Application State
let state = {
    activeUser: "Patron",  // Active role
    activeGroupId: null,   // Current active group chat
    groups: [],            // List of group chats
    employees: []          // Dynamic employees directory
};

let db = null;
let isFirebaseConnected = false;
let broadcastChannel = null;

// Tenant-scoped localStorage key üretici
function getTenantKey(baseKey) {
    const session = JSON.parse(localStorage.getItem('flowdesk_session') || '{}');
    const tenant = session.tenant || 'default';
    return baseKey + '_' + tenant;
}

// Initial Default Employees — boş başlar, patron ekler
const DEFAULT_EMPLOYEES = [];

// Calculate future dates for realistic Mock Deadlines
const getFutureDateString = (daysOffset) => {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    return d.toISOString().split('T')[0];
};

// Initial Mock Data — boş başlar
const INITIAL_MOCK_DATA = [];

// App Init
window.addEventListener("DOMContentLoaded", () => {
    loadActiveUser(); // state.activeUser'ı Firebase/render'dan ÖNCE set et
    initFirebaseOrSimulation();

    // Auto-update time countdown indicators every 60 seconds dynamically
    setInterval(() => {
        if (state.activeGroupId) {
            renderApp();
        }
    }, 60000);
});

// Initialize Firebase or Simulation Fallback
function initFirebaseOrSimulation() {
    const banner = document.getElementById("connectionBanner");

    const isFirebaseConfigured = firebaseConfig.apiKey &&
        firebaseConfig.apiKey !== "AIzaSyBULevJdG_T3I_iCTKSlRTPVPSNCa1Un8I" &&
        firebaseConfig.projectId !== "sirketicihaberlesme-647b7";

    if (isFirebaseConfigured) {
        try {
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            isFirebaseConnected = true;

            banner.innerText = "Bulut Bağlantısı Aktif (Firebase Firestore)";
            banner.className = "connection-status online-mode";

            listenToFirestore();
            showToast("Firebase Firestore bağlantısı kuruldu!");
        } catch (error) {
            console.error("Firebase başlatma hatası:", error);
            initSimulationMode(banner);
        }
    } else {
        initSimulationMode(banner);
    }
}

// Fallback: Simulation Mode with BroadcastChannel sync
function initSimulationMode(banner) {
    isFirebaseConnected = false;
    banner.innerText = "Çevrimdışı (Simülasyon Modu - Sekmeler Arası Eşzamanlı)";
    banner.className = "connection-status offline-mode";

    try {
        broadcastChannel = new BroadcastChannel("flowdesk_channel");
        broadcastChannel.onmessage = (event) => {
            if (event.data) {
                if (event.data.type === "SYNC_STATE") {
                    // Sadece aynı tenant'ın mesajlarını işle
                    const session = JSON.parse(localStorage.getItem('flowdesk_session') || '{}');
                    const myTenant = session.tenant || 'default';
                    if (event.data.tenant && event.data.tenant !== myTenant) return;

                    state.groups = event.data.groups;
                    state.employees = event.data.employees;

                    // Verify active selections
                    const visibleGroups = getVisibleGroups();
                    const stillExists = visibleGroups.some(g => g.id === state.activeGroupId);
                    if (!stillExists) {
                        state.activeGroupId = visibleGroups.length > 0 ? visibleGroups[0].id : null;
                    }

                    renderRoleSwitcher();
                    renderEmployeeChips();
                    renderApp();
                    showToast("Diğer sekmeden veriler senkronize edildi!");
                }
            }
        };
    } catch (e) {
        console.warn("BroadcastChannel desteklenmiyor.", e);
    }

    // Load local storage groups
    const savedGroups = localStorage.getItem(getTenantKey("flowdesk_groups"));
    if (savedGroups) {
        state.groups = JSON.parse(savedGroups);
    } else {
        state.groups = INITIAL_MOCK_DATA;
        localStorage.setItem(getTenantKey("flowdesk_groups"), JSON.stringify(state.groups));
    }

    // Load local storage employees
    const savedEmployees = localStorage.getItem(getTenantKey("flowdesk_employees"));
    if (savedEmployees) {
        state.employees = JSON.parse(savedEmployees);
    } else {
        state.employees = DEFAULT_EMPLOYEES;
        localStorage.setItem(getTenantKey("flowdesk_employees"), JSON.stringify(state.employees));
    }

    renderRoleSwitcher();
    renderEmployeeChips();

    // Select first group
    const visible = getVisibleGroups();
    if (visible.length > 0) {
        state.activeGroupId = visible[0].id;
    }

    renderApp();
}

// Listen to Firestore real-time snapshots
function listenToFirestore() {
    const session = JSON.parse(localStorage.getItem('flowdesk_session') || '{}');
    const tenant = session.tenant || 'default';
    const empCollection = `tenants/${tenant}/employees`;
    const grpCollection = `tenants/${tenant}/groups`;

    // 1. Listen to Employees collection
    db.collection(empCollection)
        .orderBy("createdAt", "asc")
        .onSnapshot((snapshot) => {
            let fetchedEmployees = [];
            snapshot.forEach(doc => {
                fetchedEmployees.push(doc.data());
            });

            if (fetchedEmployees.length === 0) {
                DEFAULT_EMPLOYEES.forEach(emp => {
                    db.collection(empCollection).doc(emp.name).set(emp);
                });
            } else {
                state.employees = fetchedEmployees;
                renderRoleSwitcher();
                renderEmployeeChips();
                renderApp();
            }
        }, (error) => {
            console.error("Firestore employees listen error:", error);
        });

    // 2. Listen to Groups collection
    db.collection(grpCollection)
        .orderBy("createdAt", "desc")
        .onSnapshot((snapshot) => {
            const fetchedGroups = [];
            snapshot.forEach((doc) => {
                fetchedGroups.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            state.groups = fetchedGroups;

            if (state.activeGroupId) {
                const group = state.groups.find(g => g.id === state.activeGroupId);
                const isMember = group && group.members && group.members.includes(state.activeUser);
                const isObs = group && group.observers && group.observers.includes(state.activeUser);

                if (!group || (state.activeUser !== "Patron" && !isMember && !isObs)) {
                    const visible = getVisibleGroups();
                    state.activeGroupId = visible.length > 0 ? visible[0].id : null;
                }
            } else if (fetchedGroups.length > 0 && !state.activeGroupId) {
                const visible = getVisibleGroups();
                if (visible.length > 0) {
                    state.activeGroupId = visible[0].id;
                }
            }

            renderApp();
        }, (error) => {
            console.error("Firestore groups listen error:", error);
        });
}

// Load active user
function loadActiveUser() {
    const session = JSON.parse(localStorage.getItem("flowdesk_session") || "{}");
    if (session.role === "boss") {
        state.activeUser = "Patron";
    } else if (session.role === "employee" && session.name) {
        state.activeUser = session.name;
    } else {
        // session yoksa localStorage fallback
        const saved = localStorage.getItem("flowdesk_active_user");
        if (saved) state.activeUser = saved;
    }
    localStorage.setItem("flowdesk_active_user", state.activeUser);
}

// Save data locally (Sim mode)
function saveData() {
    if (!isFirebaseConnected) {
        localStorage.setItem(getTenantKey("flowdesk_groups"), JSON.stringify(state.groups));
        localStorage.setItem(getTenantKey("flowdesk_employees"), JSON.stringify(state.employees));

        if (broadcastChannel) {
            const session = JSON.parse(localStorage.getItem('flowdesk_session') || '{}');
            broadcastChannel.postMessage({
                type: "SYNC_STATE",
                groups: state.groups,
                employees: state.employees,
                tenant: session.tenant || 'default'
            });
        }
    }
}

// Dynamic rendering of Header active role select dropdown (gizli, sadece JS için)
function renderRoleSwitcher() {
    const select = document.getElementById("roleSelect");
    if (!select) return;

    select.innerHTML = `<option value="Patron">Patron (Yönetici)</option>`;
    state.employees.forEach(emp => {
        select.innerHTML += `<option value="${escapeHTML(emp.name)}">${escapeHTML(emp.name)} (Çalışan - ${escapeHTML(emp.role)})</option>`;
    });

    // state.activeUser'a dokunma — sadece select'i mevcut değere set et
    select.value = state.activeUser;
}

// Dynamic rendering of Employee multi-select chips inside Group creation modal
function renderEmployeeChips() {
    const grid = document.getElementById("employeeSelectGrid");
    if (!grid) return;

    grid.innerHTML = "";
    state.employees.forEach(emp => {
        const chip = document.createElement("div");
        chip.className = "employee-chip";
        chip.setAttribute("data-user", emp.name);
        chip.onclick = () => toggleEmployeeChip(chip);

        chip.innerHTML = `
            <div class="employee-chip-avatar avatar-bg-${emp.color}">${escapeHTML(emp.name.charAt(0))}</div>
            <div class="employee-chip-name">${escapeHTML(emp.name)} (${escapeHTML(emp.role)})</div>
        `;
        grid.appendChild(chip);
    });
}

// Change user role
function changeUserRole(role) {
    state.activeUser = role;
    localStorage.setItem("flowdesk_active_user", role);

    const visibleGroups = getVisibleGroups();
    const hasPermission = visibleGroups.some(g => g.id === state.activeGroupId);

    if (!hasPermission) {
        state.activeGroupId = visibleGroups.length > 0 ? visibleGroups[0].id : null;
    }

    renderApp();
    showToast(`Aktif Kullanıcı Rolü Değiştirildi: '${role}'`);
}

// Get groups visible to current user (including observers!)
function getVisibleGroups() {
    if (state.activeUser === "Patron") {
        return state.groups;
    }
    return state.groups.filter(g =>
        (g.members && g.members.includes(state.activeUser)) ||
        (g.observers && g.observers.includes(state.activeUser))
    );
}

// Render components
function renderApp() {
    renderSidebar();
    renderChatArea();
    renderTasksPanel();
}

// Render Left Sidebar groups
function renderSidebar() {
    const adminPanelBtnContainer = document.getElementById("adminPanelBtnContainer");
    const groupsList = document.getElementById("groupsList");

    if (state.activeUser === "Patron") {
        adminPanelBtnContainer.style.display = "flex";
    } else {
        adminPanelBtnContainer.style.display = "none";
    }

    groupsList.innerHTML = "";
    const visibleGroups = getVisibleGroups();

    if (visibleGroups.length === 0) {
        groupsList.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 13px;">
                Erişebileceğiniz aktif sohbet grubu bulunmuyor.
            </div>`;
        return;
    }

    visibleGroups.forEach(group => {
        const completedTasksCount = group.tasks.filter(t => t.completed).length;
        const totalTasksCount = group.tasks.length;
        const percentage = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;
        const isGroupCompleted = totalTasksCount > 0 && completedTasksCount === totalTasksCount;

        const groupItem = document.createElement("div");
        groupItem.className = `group-item ${group.id === state.activeGroupId ? 'active' : ''} ${isGroupCompleted ? 'group-completed' : ''}`;
        groupItem.onclick = () => selectGroup(group.id);

        let membersAvatarsHTML = "";

        // Render Standard Members
        if (group.members) {
            group.members.forEach(member => {
                const initial = member.charAt(0);
                const isBoss = member === "Patron";

                let colorNum = "1";
                if (!isBoss) {
                    const empObj = state.employees.find(e => e.name === member);
                    if (empObj) colorNum = empObj.color;
                }

                membersAvatarsHTML += `
                    <div class="member-avatar ${isBoss ? 'boss-avatar' : 'avatar-bg-' + colorNum}" title="${escapeHTML(member)}">
                        ${escapeHTML(initial)}
                    </div>`;
            });
        }

        // Render Observers (dashed circle styling)
        if (group.observers) {
            group.observers.forEach(obs => {
                const initial = obs.charAt(0);
                membersAvatarsHTML += `
                    <div class="member-avatar observer-avatar" title="${escapeHTML(obs)} (Gözlemci)">
                        ${escapeHTML(initial)}
                    </div>`;
            });
        }

        // Countdown text calculation
        let countdownHTML = "";
        if (group.deadline) {
            const countInfo = getCountdownText(group.deadline);
            if (countInfo) {
                countdownHTML = `
                    <div class="deadline-badge ${countInfo.class}" style="margin-top: 6px;">
                        ${escapeHTML(countInfo.text)}
                    </div>`;
            }
        }

        // Check if active user is an observer here
        const isUserObserver = group.observers && group.observers.includes(state.activeUser);
        let roleLabel;
        if (isGroupCompleted) {
            roleLabel = `<span class="group-badge" style="background: rgba(16,185,129,0.25); color: #6ee7b7;">Tamamlandı ✅</span>`;
        } else if (isUserObserver) {
            roleLabel = `<span class="group-badge" style="background: rgba(99,102,241,0.25); color: #c7d2fe;">👁️ Gözlemci</span>`;
        } else {
            roleLabel = `<span class="group-badge">${totalTasksCount} Görev</span>`;
        }

        groupItem.innerHTML = `
            <div class="group-header">
                <span class="group-name">${escapeHTML(group.name)}</span>
                ${roleLabel}
            </div>
            <div class="group-members">
                ${membersAvatarsHTML}
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;">
                <div class="group-progress" style="flex: 1; min-width: 120px;">
                    <div class="progress-track">
                        <div class="progress-fill" style="width: ${percentage}%"></div>
                    </div>
                    <span>%${percentage}</span>
                </div>
                ${countdownHTML}
            </div>
        `;
        groupsList.appendChild(groupItem);
    });
}

function selectGroup(groupId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;

    const isMember = group.members && group.members.includes(state.activeUser);
    const isObs = group.observers && group.observers.includes(state.activeUser);

    if (state.activeUser !== "Patron" && !isMember && !isObs) {
        showToast("Hata: Bu gruba erişim yetkiniz bulunmamaktadır!");
        return;
    }

    state.activeGroupId = groupId;
    renderApp();
}

// Render Chat messages
function renderChatArea() {
    const chatActiveState = document.getElementById("chatActiveState");
    const chatEmptyState = document.getElementById("chatEmptyState");

    if (!state.activeGroupId) {
        chatActiveState.style.display = "none";
        chatEmptyState.style.display = "flex";
        return;
    }

    const group = state.groups.find(g => g.id === state.activeGroupId);
    if (!group) {
        chatActiveState.style.display = "none";
        chatEmptyState.style.display = "flex";
        return;
    }

    const isMember = group.members && group.members.includes(state.activeUser);
    const isObs = group.observers && group.observers.includes(state.activeUser);

    if (state.activeUser !== "Patron" && !isMember && !isObs) {
        chatActiveState.style.display = "none";
        chatEmptyState.style.display = "flex";
        state.activeGroupId = null;
        return;
    }

    chatActiveState.style.display = "flex";
    chatEmptyState.style.display = "none";

    // Header Info
    const activeChatTitle = document.getElementById("activeChatTitle");
    const activeChatSubtitle = document.getElementById("activeChatSubtitle");
    const activeChatDeadline = document.getElementById("activeChatDeadline");
    const generateObserverCodeBtn = document.getElementById("generateObserverCodeBtn");
    const addObserverBtn = document.getElementById("addObserverBtn");

    activeChatTitle.innerText = group.name;

    // Observer Buttons Visibility (Patron only)
    if (state.activeUser === "Patron") {
        generateObserverCodeBtn.style.display = "block";
        addObserverBtn.style.display = "block";
    } else {
        generateObserverCodeBtn.style.display = "none";
        addObserverBtn.style.display = "none";
    }

    // Deadline Countdown Display
    if (group.deadline) {
        const timeInfo = getCountdownText(group.deadline);
        if (timeInfo) {
            activeChatDeadline.innerText = timeInfo.text;
            activeChatDeadline.className = `deadline-badge ${timeInfo.class}`;
            activeChatDeadline.style.display = "inline-flex";
        } else {
            activeChatDeadline.style.display = "none";
        }
    } else {
        activeChatDeadline.style.display = "none";
    }

    const staffMembers = group.members.filter(m => m !== "Patron");
    const observersText = group.observers && group.observers.length > 0 ? ` | Gözlemciler: ${group.observers.join(", ")}` : "";
    activeChatSubtitle.innerText = `Üyeler: Patron ve ${staffMembers.join(", ")}${observersText}`;

    // Observer Privileges Block: Toggle Input Area
    const chatInputArea = document.getElementById("chatInputArea");
    const chatObserverBanner = document.getElementById("chatObserverBanner");

    if (isObs) {
        // Observers are locked in read-only mode
        chatInputArea.style.display = "none";
        chatObserverBanner.style.display = "flex";
        activeChatTitle.innerHTML = `👁️ ${escapeHTML(group.name)} <span style="font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; background: rgba(99, 102, 241, 0.25); color: #c7d2fe; margin-left: 10px;">Gözlemci Modu</span>`;
    } else {
        chatInputArea.style.display = "flex";
        chatObserverBanner.style.display = "none";
    }

    // Populate Messages
    const chatMessages = document.getElementById("chatMessages");
    chatMessages.innerHTML = "";

    if (group.messages && group.messages.length > 0) {
        group.messages.forEach(msg => {
            if (msg.isSystem) {
                const sysDiv = document.createElement("div");
                sysDiv.className = "system-message";
                sysDiv.innerHTML = `⚙️ ${escapeHTML(msg.text)}`;
                chatMessages.appendChild(sysDiv);
            } else {
                const isOutgoing = msg.sender === state.activeUser;
                const initial = msg.sender.charAt(0);

                const msgWrapper = document.createElement("div");
                msgWrapper.className = `message-wrapper ${isOutgoing ? 'outgoing' : 'incoming'}`;

                let avatarClass = "boss-avatar";
                if (msg.sender !== "Patron") {
                    const empObj = state.employees.find(e => e.name === msg.sender);
                    avatarClass = "avatar-bg-" + (empObj ? empObj.color : "1");
                }

                msgWrapper.innerHTML = `
                    <div class="message-avatar ${avatarClass}" title="${escapeHTML(msg.sender)}">${escapeHTML(initial)}</div>
                    <div class="message-content-box">
                        <span class="message-sender">${escapeHTML(msg.sender)}</span>
                        <div class="message-bubble">${escapeHTML(msg.text)}</div>
                        <span class="message-time">${msg.time}</span>
                    </div>
                `;
                chatMessages.appendChild(msgWrapper);
            }
        });
    }

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Render right Tasks panel
function renderTasksPanel() {
    const tasksPanelContent = document.getElementById("tasksPanelContent");
    const tasksPanelEmpty = document.getElementById("tasksPanelEmpty");

    if (!state.activeGroupId) {
        tasksPanelContent.style.display = "none";
        tasksPanelEmpty.style.display = "flex";
        return;
    }

    const group = state.groups.find(g => g.id === state.activeGroupId);
    if (!group) {
        tasksPanelContent.style.display = "none";
        tasksPanelEmpty.style.display = "flex";
        return;
    }

    tasksPanelContent.style.display = "flex";
    tasksPanelEmpty.style.display = "none";

    const total = group.tasks.length;
    const completed = group.tasks.filter(t => t.completed).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    document.getElementById("tasksSummaryCount").innerText = `${completed}/${total}`;
    document.getElementById("tasksProgressBar").style.width = `${percentage}%`;

    const tasksList = document.getElementById("tasksList");
    tasksList.innerHTML = "";

    // Observers cannot check off tasks (Read-Only)
    const isObserver = group.observers && group.observers.includes(state.activeUser);
    const hasPermission = group.members.includes(state.activeUser) && !isObserver;

    group.tasks.forEach(task => {
        const card = document.createElement("div");
        card.className = `task-card ${task.completed ? 'completed' : ''}`;

        let metaText = "Bekliyor";
        if (task.completed) {
            metaText = `✓ <span class="task-completed-by">${escapeHTML(task.completedBy)}</span> tamamladı`;
        }

        card.innerHTML = `
            <label class="checkbox-container">
                <input type="checkbox" ${task.completed ? 'checked' : ''} 
                       ${!hasPermission ? 'disabled' : ''} 
                       onchange="toggleTaskStatus('${group.id}', '${task.id}', this.checked)">
                <span class="checkmark"></span>
            </label>
            <div class="task-details">
                <span class="task-title">${escapeHTML(task.title)}</span>
                <div class="task-meta">
                    <span>Durum:</span>
                    <span>${metaText}</span>
                </div>
            </div>
        `;
        tasksList.appendChild(card);
    });
}

// Toggle Task
function toggleTaskStatus(groupId, taskId, isChecked) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;

    // If group is already completed, prevent unchecking
    const allDoneBefore = group.tasks.every(t => t.completed);

    const task = group.tasks.find(t => t.id === taskId);
    if (!task) return;

    const previousCompleted = task.completed;
    task.completed = isChecked;
    task.completedBy = isChecked ? state.activeUser : null;

    if (previousCompleted !== isChecked) {
        const timeNow = getFormattedTime();
        let logText = "";

        if (isChecked) {
            logText = `${state.activeUser}, '${task.title}' görevini tamamladı! ✅`;
            showToast(`Görev tamamlandı: ${task.title}`);
        } else {
            logText = `${state.activeUser}, '${task.title}' görevinin işaretini kaldırdı. ⚠️`;
            showToast(`Görev geri alındı: ${task.title}`);
        }

        group.messages.push({
            sender: "Sistem",
            text: logText,
            time: timeNow,
            isSystem: true
        });

        // Check if ALL tasks are now completed -> auto-close the group
        const allDoneNow = group.tasks.every(t => t.completed);
        if (allDoneNow && !allDoneBefore) {
            group.messages.push({
                sender: "Sistem",
                text: `🎉🎉🎉 TÜM GÖREVLER TAMAMLANDI! '${group.name}' projesi başarıyla sona erdi. Bu sohbet artık arşivlendi ve salt-okunur moddadır. Tebrikler ekip!`,
                time: timeNow,
                isSystem: true
            });
            showToast(`🎉 Tüm görevler tamamlandı! '${group.name}' projesi kapandı.`);
        }

        updateGroupInDB(group);
    }
}

// Chat Send
function handleChatSubmit(event) {
    if (event.key === "Enter") {
        sendMessage();
    }
}

function sendMessage() {
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text || !state.activeGroupId) return;

    const group = state.groups.find(g => g.id === state.activeGroupId);
    if (!group) return;

    group.messages.push({
        sender: state.activeUser,
        text: text,
        time: getFormattedTime(),
        isSystem: false
    });

    input.value = "";

    updateGroupInDB(group);
}

// DB update orchestrator
function updateGroupInDB(group) {
    if (isFirebaseConnected) {
        const session = JSON.parse(localStorage.getItem('flowdesk_session') || '{}');
        const tenant = session.tenant || 'default';
        db.collection(`tenants/${tenant}/groups`).doc(group.id).update({
            tasks: group.tasks,
            messages: group.messages,
            observers: group.observers || []
        }).catch(err => {
            console.error("Firestore güncelleme hatası:", err);
            showToast("Veri tabanı eşitleme hatası.");
        });
    } else {
        saveData();
        renderApp();
    }
}

// Group Modals
function openCreateGroupModal() {
    if (state.activeUser !== "Patron") {
        showToast("Hata: Sadece Patron yeni görev atayabilir.");
        return;
    }

    document.getElementById("groupNameInput").value = "";
    document.getElementById("groupDeadlineInput").value = "";

    const chips = document.querySelectorAll(".employee-chip");
    chips.forEach(c => c.classList.remove("selected"));

    const builder = document.getElementById("modalTasksBuilder");
    builder.innerHTML = `
        <div class="task-builder-item">
            <input type="text" class="form-input task-builder-input" style="flex: 1;" placeholder="1. Görevi yazın...">
            <button class="btn-remove-task" onclick="removeTaskBuilderItem(this)">&times;</button>
        </div>
        <div class="task-builder-item">
            <input type="text" class="form-input task-builder-input" style="flex: 1;" placeholder="2. Görevi yazın...">
            <button class="btn-remove-task" onclick="removeTaskBuilderItem(this)">&times;</button>
        </div>
        <div class="task-builder-item">
            <input type="text" class="form-input task-builder-input" style="flex: 1;" placeholder="3. Görevi yazın...">
            <button class="btn-remove-task" onclick="removeTaskBuilderItem(this)">&times;</button>
        </div>
    `;

    document.getElementById("createGroupModal").classList.add("active");
}

function closeCreateGroupModal() {
    document.getElementById("createGroupModal").classList.remove("active");
}

function toggleEmployeeChip(chip) {
    chip.classList.toggle("selected");
}

function addTaskBuilderItem() {
    const builder = document.getElementById("modalTasksBuilder");
    const count = builder.children.length + 1;

    const div = document.createElement("div");
    div.className = "task-builder-item";
    div.innerHTML = `
        <input type="text" class="form-input task-builder-input" style="flex: 1;" placeholder="${count}. Görevi yazın...">
        <button class="btn-remove-task" onclick="removeTaskBuilderItem(this)">&times;</button>
    `;
    builder.appendChild(div);
}

function removeTaskBuilderItem(btn) {
    const builder = document.getElementById("modalTasksBuilder");
    if (builder.children.length <= 1) {
        showToast("En az 1 görev eklemeniz gerekmektedir.");
        return;
    }
    btn.parentElement.remove();
}

// submit new group chat
function submitNewGroup() {
    const groupName = document.getElementById("groupNameInput").value.trim();
    const deadlineVal = document.getElementById("groupDeadlineInput").value;

    if (!groupName) {
        showToast("Hata: Lütfen sohbet grubu adı girin.");
        return;
    }

    const selectedChips = document.querySelectorAll(".employee-chip.selected");
    const members = ["Patron"];
    selectedChips.forEach(chip => {
        members.push(chip.getAttribute("data-user"));
    });

    if (members.length === 1) {
        showToast("Hata: Lütfen atayacağınız en az 1 eleman seçin.");
        return;
    }

    const taskInputs = document.querySelectorAll(".task-builder-input");
    const tasks = [];
    let taskCounter = 1;

    taskInputs.forEach(input => {
        const title = input.value.trim();
        if (title) {
            tasks.push({
                id: `task_${Date.now()}_${taskCounter++}`,
                title: title,
                completed: false,
                completedBy: null
            });
        }
    });

    if (tasks.length === 0) {
        showToast("Hata: Lütfen en az 1 görev yazın.");
        return;
    }

    const timeNow = getFormattedTime();
    const staffText = members.filter(m => m !== 'Patron').join(', ');
    const deadlineDisplay = deadlineVal ? ` | Bitiş Tarihi: ${deadlineVal}` : "";

    const newGroup = {
        name: groupName,
        members: members,
        observers: [],
        deadline: deadlineVal || null,
        tasks: tasks,
        messages: [
            {
                sender: "Sistem",
                text: `Patron '${groupName}' projesini oluşturdu. Yetkili Elemanlar: ${staffText}${deadlineDisplay}. Bu sohbet kanalına ve görev kutularına sadece yetkili kişiler erişebilir!`,
                time: timeNow,
                isSystem: true
            },
            {
                sender: "Sistem",
                text: `Tanımlanan Görevler: ${tasks.map(t => t.title).join(' | ')}`,
                time: timeNow,
                isSystem: true
            },
            {
                sender: "Patron",
                text: `${staffText}, bu projenin görevlerini atadım. Sohbet alanından gelişmeleri tartışabilir ve görevleri tamamladıkça sağ panelden onaylayabilirsiniz. Kolay gelsin!`,
                time: timeNow,
                isSystem: false
            }
        ],
        createdAt: Date.now()
    };

    const groupId = `group_${Date.now()}`;

    if (isFirebaseConnected) {
        const session = JSON.parse(localStorage.getItem('flowdesk_session') || '{}');
        const tenant = session.tenant || 'default';
        db.collection(`tenants/${tenant}/groups`).doc(groupId).set(newGroup)
            .then(() => {
                state.activeGroupId = groupId;
                closeCreateGroupModal();
                showToast(`"${groupName}" grubu başarıyla kuruldu!`);
            })
            .catch(err => {
                console.error("Firestore error:", err);
                showToast("Buluta bağlanırken hata oluştu.");
            });
    } else {
        newGroup.id = groupId;
        state.groups.unshift(newGroup);
        state.activeGroupId = groupId;

        saveData();
        closeCreateGroupModal();
        renderApp();
        showToast(`"${groupName}" grubu (Simülasyon) başarıyla kuruldu!`);
    }
}

// Boss/Admin Employee Registration Modals
function openCreateEmployeeModal() {
    if (state.activeUser !== "Patron") {
        showToast("Hata: Sadece Patron yeni çalışan kaydedebilir.");
        return;
    }
    document.getElementById("employeeNameInput").value = "";
    document.getElementById("employeeRoleInput").value = "";
    const passEl = document.getElementById("employeePassInput");
    if (passEl) passEl.value = "";
    document.getElementById("createEmployeeModal").classList.add("active");
}

function closeCreateEmployeeModal() {
    document.getElementById("createEmployeeModal").classList.remove("active");
    const passEl = document.getElementById("employeePassInput");
    if (passEl) passEl.value = "";
}

// Submit newly registered employee
function submitNewEmployee() {
    const name = document.getElementById("employeeNameInput").value.trim();
    const role = document.getElementById("employeeRoleInput").value.trim();
    const pass = document.getElementById("employeePassInput") ? document.getElementById("employeePassInput").value.trim() : "";

    if (!name) {
        showToast("Hata: Lütfen eleman adı girin.");
        return;
    }
    if (!role) {
        showToast("Hata: Lütfen elemanın uzmanlık alanını / rolünü girin.");
        return;
    }
    if (!pass) {
        showToast("Hata: Lütfen personel için bir giriş şifresi belirleyin.");
        return;
    }

    const duplicate = name.toLowerCase() === "patron" || state.employees.some(e => e.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
        showToast("Hata: Bu isimde bir çalışan zaten kayıtlı!");
        return;
    }

    const colorRadios = document.getElementsByName("avatarColor");
    let colorVal = "1";
    for (let i = 0; i < colorRadios.length; i++) {
        if (colorRadios[i].checked) {
            colorVal = colorRadios[i].value;
            break;
        }
    }

    const newEmp = {
        name: name,
        role: role,
        color: colorVal,
        password: pass,
        createdAt: Date.now()
    };

    // Şifreyi fd_companies içindeki tenant'a da kaydet
    const session = JSON.parse(localStorage.getItem("flowdesk_session") || "{}");
    if (session.tenant) {
        const companies = JSON.parse(localStorage.getItem("fd_companies") || "{}");
        if (companies[session.tenant]) {
            if (!companies[session.tenant].empPasswords) {
                companies[session.tenant].empPasswords = {};
            }
            companies[session.tenant].empPasswords[name.toLowerCase()] = pass;
            localStorage.setItem("fd_companies", JSON.stringify(companies));
        }
    }

    if (isFirebaseConnected) {
        const session2 = JSON.parse(localStorage.getItem('flowdesk_session') || '{}');
        const tenant2 = session2.tenant || 'default';
        db.collection(`tenants/${tenant2}/employees`).doc(name).set(newEmp)
            .then(() => {
                closeCreateEmployeeModal();
                showToast(`"${name}" adlı çalışan başarıyla buluta kaydedildi!`);
            })
            .catch(err => {
                console.error("Firestore employee save error:", err);
                showToast("Buluta kaydedilirken hata oluştu.");
            });
    } else {
        state.employees.push(newEmp);
        saveData();

        renderRoleSwitcher();
        renderEmployeeChips();
        renderApp();

        closeCreateEmployeeModal();
        showToast(`"${name}" adlı çalışan başarıyla kaydedildi! Şifresi belirlendi.`);
    }
}

// ====================================================================
//                    GÖZLEMCİ & DEADLINE MOTORU
// ====================================================================

// Encrypt Group ID to Base64 Invitation Token
function encryptGroupInvitation(groupId) {
    return btoa(`FLOWDESK-INV-${groupId}`);
}

// Decrypt Base64 Invitation Token to Group ID
function decryptGroupInvitation(code) {
    try {
        const decoded = atob(code);
        if (decoded.startsWith("FLOWDESK-INV-")) {
            return decoded.replace("FLOWDESK-INV-", "");
        }
    } catch (e) { }
    return null;
}

// Generate & copy secure observer code (Boss only)
function generateObserverCode() {
    if (!state.activeGroupId) return;
    const code = encryptGroupInvitation(state.activeGroupId);

    navigator.clipboard.writeText(code).then(() => {
        showToast("🔑 Gözlemci Davet Kodu panoya kopyalandı! Bu şifreli kodu denetçiye gönderebilirsiniz.");
    }).catch(err => {
        alert(`Gözlemci Şifreli Davet Kodu:\n\n${code}\n\nBu kodu kopyalayıp gözlemciye iletin.`);
    });
}

// Open Add Observer Modal (Boss directly adds observer)
function openAddObserverModal() {
    if (state.activeUser !== "Patron") {
        showToast("Hata: Sadece Patron gözlemci ekleyebilir.");
        return;
    }
    if (!state.activeGroupId) {
        showToast("Hata: Lütfen önce bir sohbet grubu seçin.");
        return;
    }

    const group = state.groups.find(g => g.id === state.activeGroupId);
    if (!group) return;

    const grid = document.getElementById("observerSelectGrid");
    const noMsg = document.getElementById("noObserverCandidates");
    grid.innerHTML = "";

    // Filter: show employees who are NOT members and NOT already observers
    const candidates = state.employees.filter(emp => {
        const isMember = group.members && group.members.includes(emp.name);
        const isObserver = group.observers && group.observers.includes(emp.name);
        return !isMember && !isObserver;
    });

    if (candidates.length === 0) {
        noMsg.style.display = "block";
    } else {
        noMsg.style.display = "none";
        candidates.forEach(emp => {
            const chip = document.createElement("div");
            chip.className = "employee-chip";
            chip.setAttribute("data-user", emp.name);
            chip.onclick = () => chip.classList.toggle("selected");
            chip.innerHTML = `
                <div class="employee-chip-avatar avatar-bg-${emp.color}">${escapeHTML(emp.name.charAt(0))}</div>
                <div class="employee-chip-name">${escapeHTML(emp.name)} (${escapeHTML(emp.role)})</div>
            `;
            grid.appendChild(chip);
        });
    }

    document.getElementById("addObserverModal").classList.add("active");
}

function closeAddObserverModal() {
    document.getElementById("addObserverModal").classList.remove("active");
}

// Submit selected observers to the active group
function submitAddObserver() {
    const group = state.groups.find(g => g.id === state.activeGroupId);
    if (!group) return;

    const selectedChips = document.querySelectorAll("#observerSelectGrid .employee-chip.selected");
    if (selectedChips.length === 0) {
        showToast("Hata: Lütfen en az 1 kişi seçin.");
        return;
    }

    if (!group.observers) {
        group.observers = [];
    }

    const timeNow = getFormattedTime();
    const addedNames = [];

    selectedChips.forEach(chip => {
        const name = chip.getAttribute("data-user");
        if (!group.observers.includes(name)) {
            group.observers.push(name);
            addedNames.push(name);

            group.messages.push({
                sender: "Sistem",
                text: `Patron, ${name} kişisini bu projeye GÖZLEMCİ 👁️ olarak ekledi.`,
                time: timeNow,
                isSystem: true
            });
        }
    });

    if (addedNames.length > 0) {
        updateGroupInDB(group);
        closeAddObserverModal();
        showToast(`${addedNames.join(", ")} gözlemci olarak eklendi!`);
    } else {
        showToast("Seçilen kişiler zaten gözlemci.");
        closeAddObserverModal();
    }
}

// Join Group as Observer (Employee or External viewer)
function joinAsObserver() {
    const input = document.getElementById("observerCodeInput");
    const code = input.value.trim();
    if (!code) {
        showToast("Lütfen şifreli bir davet kodu girin.");
        return;
    }

    const groupId = decryptGroupInvitation(code);
    if (!groupId) {
        showToast("Hata: Geçersiz veya şifresi çözülemeyen davet kodu!");
        return;
    }

    const group = state.groups.find(g => g.id === groupId);
    if (!group) {
        showToast("Hata: Bu davet koduna ait bir sohbet grubu bulunamadı!");
        return;
    }

    // Check if user is already a standard member
    if (group.members && group.members.includes(state.activeUser)) {
        showToast("Hata: Zaten bu projenin asil üyesisiniz. Gözlemci olamazsınız.");
        return;
    }

    if (!group.observers) {
        group.observers = [];
    }

    // Check if already registered as observer
    if (group.observers.includes(state.activeUser)) {
        showToast("Zaten bu projeyi gözlemliyorsunuz.");
        state.activeGroupId = groupId;
        renderApp();
        input.value = "";
        return;
    }

    // Add to observer pool
    group.observers.push(state.activeUser);

    const timeNow = getFormattedTime();
    group.messages.push({
        sender: "Sistem",
        text: `${state.activeUser} şifreli davet kodunu kullanarak GÖZLEMCİ 👁️ olarak projeye dahil oldu!`,
        time: timeNow,
        isSystem: true
    });

    updateGroupInDB(group);

    state.activeGroupId = groupId;
    renderApp();
    input.value = "";
    showToast(`"${group.name}" projesine Gözlemci olarak katıldınız!`);
}

// Parse remaining countdown time text
function getCountdownText(deadlineStr) {
    if (!deadlineStr) return null;
    const deadline = new Date(deadlineStr);
    deadline.setHours(23, 59, 59, 999); // Set to end of day

    const now = new Date();
    const diff = deadline - now;

    if (diff < 0) {
        return { text: "Süre Doldu!", class: "danger-time" };
    }

    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (diffDays > 3) {
        return { text: `⏳ Kalan: ${diffDays} gün`, class: "active-time" };
    } else if (diffDays >= 1) {
        return { text: `⏳ Kalan: ${diffDays} g, ${diffHours} s`, class: "warning-time" };
    } else {
        return { text: `⏳ Kalan: ${diffHours} saat!`, class: "danger-time" };
    }
}

// ====================================================================

// Toast
function showToast(message) {
    const toast = document.getElementById("toastNotification");
    const toastMsg = document.getElementById("toastMessage");

    toastMsg.innerText = message;
    toast.classList.add("active");

    setTimeout(() => {
        toast.classList.remove("active");
    }, 4000);
}

// Time formater
function getFormattedTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// HTML escape
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// ====================================================================
//                    LOGIN / SESSION SİSTEMİ
// ====================================================================

// Tenant ID üretici
function lcGenTenant() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let c = 'fd-';
    for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
}

function lcRegenTenant() {
    const el = document.getElementById('lc-reg-tid');
    if (el) el.value = lcGenTenant();
    const w = document.getElementById('lc-reg-warn');
    if (w) w.classList.remove('on');
}

// Tab değiştir
function lcTab(t) {
    ['emp', 'boss', 'reg'].forEach(id => {
        document.getElementById('lct-' + id).classList.remove('on');
        document.getElementById('lcp-' + id).classList.remove('on');
    });
    document.getElementById('lct-' + t).classList.add('on');
    document.getElementById('lcp-' + t).classList.add('on');
    // hataları temizle
    document.querySelectorAll('.lc-err').forEach(e => e.classList.remove('on'));
}

function lcErr(id, msg) {
    const el = document.getElementById(id);
    el.innerText = msg;
    el.classList.add('on');
}

function lcToast(msg) {
    const t = document.getElementById('lc-toast');
    t.innerText = msg;
    t.classList.add('on');
    setTimeout(() => t.classList.remove('on'), 3500);
}

// Overlay'i kapat (giriş başarılı)
function lcClose() {
    const ov = document.getElementById('loginOverlay');
    if (ov) {
        ov.style.opacity = '0';
        ov.style.transition = 'opacity 0.5s ease';
        setTimeout(() => ov.style.display = 'none', 500);
    }
    // Kullanıcı adını header'da göster
    lcUpdateHeaderLabel();
    // Tenant verilerini yeniden yükle (doğru şirkete ait veriler)
    loadActiveUser();
    initSimulationMode(document.getElementById("connectionBanner"));
}

function lcUpdateHeaderLabel() {
    const session = JSON.parse(localStorage.getItem('flowdesk_session') || '{}');
    const label = document.getElementById('activeUserLabel');
    if (!label || !session.name) return;
    const roleText = session.role === 'boss' ? 'Patron' : 'Personel';
    label.innerText = session.name + ' (' + roleText + ')';
}

// Personel Girişi
function lcLoginEmp() {
    const tenant = document.getElementById('lc-emp-tenant').value.trim();
    const name = document.getElementById('lc-emp-name').value.trim();
    const pass = document.getElementById('lc-emp-pass').value.trim();
    const errId = 'lc-emp-err';

    document.getElementById(errId).classList.remove('on');

    if (!tenant || !name || !pass) { lcErr(errId, '❌ Lütfen tüm alanları doldurun.'); return; }

    const companies = JSON.parse(localStorage.getItem('fd_companies') || '{}');
    if (!companies[tenant]) { lcErr(errId, '❌ Bu şirket kodu sistemde kayıtlı değil.'); return; }

    const td = companies[tenant];
    const empPasswords = td.empPasswords || {};
    const nameLower = name.toLowerCase();

    // Önce fd_companies içindeki empPasswords'a bak (en güvenilir kaynak)
    if (empPasswords[nameLower] !== undefined) {
        if (pass !== empPasswords[nameLower]) {
            lcErr(errId, '❌ Şifre hatalı. Patronunuzdan aldığınız şifreyi girin.');
            return;
        }
    } else {
        // empPasswords'da yoksa tenant'a ait flowdesk_employees içinde ara (fallback)
        const tenantEmpKey = 'flowdesk_employees_' + tenant;
        const empList = JSON.parse(localStorage.getItem(tenantEmpKey) || '[]');
        const emp = empList.find(e => e.name.toLowerCase() === nameLower);
        if (!emp) {
            lcErr(errId, '❌ Bu isimde personel kayıtlı değil. Patronunuza başvurun.');
            return;
        }
        if (!emp.password || pass !== emp.password) {
            lcErr(errId, '❌ Şifre hatalı. Patronunuzdan aldığınız şifreyi girin.');
            return;
        }
    }

    // Gerçek adı bul (büyük/küçük harf için tenant'a ait employees'dan al)
    const tenantEmpKey2 = 'flowdesk_employees_' + tenant;
    const empList2 = JSON.parse(localStorage.getItem(tenantEmpKey2) || '[]');
    const empObj = empList2.find(e => e.name.toLowerCase() === nameLower);
    const realName = empObj ? empObj.name : name;

    // Başarılı
    localStorage.setItem('flowdesk_active_user', realName);
    localStorage.setItem('flowdesk_session', JSON.stringify({ role: 'employee', name: realName, tenant }));
    lcToast('✅ Giriş başarılı! Hoş geldin, ' + realName);
    setTimeout(lcClose, 1000);
}

// Patron Girişi
function lcLoginBoss() {
    const tenant = document.getElementById('lc-boss-tenant').value.trim();
    const pass = document.getElementById('lc-boss-pass').value.trim();
    const errId = 'lc-boss-err';

    document.getElementById(errId).classList.remove('on');

    if (!tenant || !pass) { lcErr(errId, '❌ Lütfen tüm alanları doldurun.'); return; }

    const companies = JSON.parse(localStorage.getItem('fd_companies') || '{}');
    if (!companies[tenant]) { lcErr(errId, '❌ Bu şirket kodu sistemde kayıtlı değil.'); return; }

    if (pass !== companies[tenant].bossPass) { lcErr(errId, '❌ Patron şifresi yanlış.'); return; }

    // Başarılı
    localStorage.setItem('flowdesk_active_user', 'Patron');
    localStorage.setItem('flowdesk_session', JSON.stringify({ role: 'boss', name: companies[tenant].ownerName, tenant }));
    lcToast('✅ Patron girişi başarılı! Hoş geldin, ' + companies[tenant].ownerName);
    setTimeout(lcClose, 1000);
}

// Şirket Kur
function lcRegister() {
    const company = document.getElementById('lc-reg-company').value.trim();
    const owner = document.getElementById('lc-reg-owner').value.trim();
    const pass = document.getElementById('lc-reg-pass').value.trim();
    const tid = document.getElementById('lc-reg-tid').value.trim();
    const errId = 'lc-reg-err';

    document.getElementById(errId).classList.remove('on');

    if (!company || !owner || !pass) { lcErr(errId, '❌ Lütfen tüm alanları doldurun.'); return; }
    if (pass.length < 4) { lcErr(errId, '❌ Şifre en az 4 karakter olmalıdır.'); return; }

    const companies = JSON.parse(localStorage.getItem('fd_companies') || '{}');
    companies[tid] = { companyName: company, ownerName: owner, bossPass: pass, empPass: pass, createdAt: Date.now() };
    localStorage.setItem('fd_companies', JSON.stringify(companies));

    // Uyarı göster
    document.getElementById('lc-reg-warn-code').innerText = tid;
    document.getElementById('lc-reg-warn').classList.add('on');

    lcToast('🏢 Şirket kaydedildi! Yönlendiriliyor...');

    localStorage.setItem('flowdesk_active_user', 'Patron');
    localStorage.setItem('flowdesk_session', JSON.stringify({ role: 'boss', name: owner, tenant: tid }));

    setTimeout(lcClose, 3000);
}

// Çıkış
function lcLogout() {
    if (!confirm('Oturumu kapatmak istediğinize emin misiniz?')) return;
    localStorage.removeItem('flowdesk_session');
    localStorage.removeItem('flowdesk_active_user');
    // In-memory state'i temizle (bir sonraki firma giriş yaptığında temiz başlasın)
    state.groups = [];
    state.employees = [];
    state.activeGroupId = null;
    state.activeUser = "Patron";
    // Overlay'i tekrar göster
    const ov = document.getElementById('loginOverlay');
    if (ov) {
        ov.style.display = 'flex';
        ov.style.opacity = '1';
        ov.style.transition = '';
        // input'ları temizle
        ['lc-emp-tenant', 'lc-emp-name', 'lc-emp-pass', 'lc-boss-tenant', 'lc-boss-pass'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.querySelectorAll('.lc-err').forEach(e => e.classList.remove('on'));
        lcTab('emp');
    }
}

// Sayfa yüklenince: oturum varsa overlay kapat, yoksa göster
window.addEventListener('DOMContentLoaded', function () {
    // Tenant ID input başlat
    const tidEl = document.getElementById('lc-reg-tid');
    if (tidEl) tidEl.value = lcGenTenant();

    const session = localStorage.getItem('flowdesk_session');
    if (session) {
        // Oturum var — overlay'i gösterme
        lcClose();
        lcUpdateHeaderLabel();
    }
    // Oturum yoksa overlay zaten görünür (varsayılan display:flex)

    // Enter tuşu desteği
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        const ov = document.getElementById('loginOverlay');
        if (!ov || ov.style.display === 'none') return;
        const active = document.querySelector('.lc-panel.on');
        if (!active) return;
        if (active.id === 'lcp-emp') lcLoginEmp();
        else if (active.id === 'lcp-boss') lcLoginBoss();
        else if (active.id === 'lcp-reg') lcRegister();
    });
});