// ==================== FIREBASE SETUP ====================
const firebaseConfig = {
    databaseURL: "https://data-72ed1-default-rtdb.firebaseio.com/"
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ==================== CONSTANTS ====================
const ROOMS = ['Room 1', 'Room 2', 'Room 3', 'Room 4', 'Room 5'];

// ==================== APP STATE ====================
const state = {
    customers: [],
    appointments: [],
    services: [],               // list of service name strings
    settings: {
        whatsappNumber: '03711621',
        reminderMessage: 'Hi {name}, this is a reminder for your {service} appointment on {date} at {time} in {room}. See you soon!'
    },
    currentView: 'dashboard',
    currentMonth: new Date(),
    selectedDate: null,
    editingCustomer: null,
    editingAppointment: null,
    selectedRoom: null
};

// ==================== FIREBASE STATUS ====================
const updateFirebaseStatus = (connected) => {
    const indicator = document.getElementById('firebaseIndicator');
    const status   = document.getElementById('firebaseStatus');
    if (connected) {
        indicator.classList.add('connected');
        indicator.classList.remove('disconnected');
        status.textContent = 'Firebase Connected';
    } else {
        indicator.classList.remove('connected');
        indicator.classList.add('disconnected');
        status.textContent = 'Firebase Disconnected';
    }
};
database.ref('.info/connected').on('value', snap => updateFirebaseStatus(snap.val() === true));

// ==================== FIREBASE DATA OPS ====================

const loadDataFromFirebase = async () => {
    try {
        const [custSnap, aptSnap, setSnap, svcSnap] = await Promise.all([
            database.ref('customers').once('value'),
            database.ref('appointments').once('value'),
            database.ref('settings').once('value'),
            database.ref('services').once('value')
        ]);

        state.customers = [];
        custSnap.forEach(c => state.customers.push({ id: c.key, ...c.val() }));

        state.appointments = [];
        aptSnap.forEach(a => state.appointments.push({ id: a.key, ...a.val() }));

        if (setSnap.exists()) {
            state.settings = setSnap.val();
            document.getElementById('whatsappNumber').value  = state.settings.whatsappNumber  || '';
            document.getElementById('reminderMessage').value = state.settings.reminderMessage || '';
        }

        state.services = [];
        if (svcSnap.exists()) {
            svcSnap.forEach(s => state.services.push({ id: s.key, name: s.val() }));
        }

        renderCurrentView();
        renderServicesList();
    } catch (err) {
        // Firebase permission errors are expected until DB rules are configured
        console.warn('Firebase load note:', err.message);
        renderCurrentView();
        renderServicesList();
    }
};

// ==================== SERVICES FIREBASE ====================

const addServiceToFirebase = async (name) => {
    const ref = database.ref('services').push();
    await ref.set(name);
    return { id: ref.key, name };
};

const removeServiceFromFirebase = async (id) => {
    await database.ref(`services/${id}`).remove();
};

// Real-time listeners for services
database.ref('services').on('child_added', snap => {
    const svc = { id: snap.key, name: snap.val() };
    if (!state.services.find(s => s.id === svc.id)) {
        state.services.push(svc);
        renderServicesList();
    }
});
database.ref('services').on('child_removed', snap => {
    state.services = state.services.filter(s => s.id !== snap.key);
    renderServicesList();
});

const saveCustomerToFirebase = async (customer) => {
    if (customer.id) {
        await database.ref(`customers/${customer.id}`).update(customer);
    } else {
        const ref = database.ref('customers').push();
        customer.id = ref.key;
        await ref.set(customer);
    }
    return customer;
};

const deleteCustomerFromFirebase = async (customerId) => {
    await database.ref(`customers/${customerId}`).remove();
    const deletes = state.appointments
        .filter(a => a.customerId === customerId)
        .map(a => database.ref(`appointments/${a.id}`).remove());
    await Promise.all(deletes);
};

const saveAppointmentToFirebase = async (appointment) => {
    if (appointment.id) {
        await database.ref(`appointments/${appointment.id}`).update(appointment);
    } else {
        const ref = database.ref('appointments').push();
        appointment.id = ref.key;
        await ref.set(appointment);
    }
    return appointment;
};

const deleteAppointmentFromFirebase = async (id) => {
    await database.ref(`appointments/${id}`).remove();
};

const saveSettingsToFirebase = async (settings) => {
    await database.ref('settings').set(settings);
};

// Real-time listeners
database.ref('customers').on('child_added', snap => {
    const c = { id: snap.key, ...snap.val() };
    if (!state.customers.find(x => x.id === c.id)) { state.customers.push(c); renderCurrentView(); }
});
database.ref('customers').on('child_changed', snap => {
    const c = { id: snap.key, ...snap.val() };
    const i = state.customers.findIndex(x => x.id === c.id);
    if (i !== -1) { state.customers[i] = c; renderCurrentView(); }
});
database.ref('customers').on('child_removed', snap => {
    state.customers = state.customers.filter(x => x.id !== snap.key);
    renderCurrentView();
});

database.ref('appointments').on('child_added', snap => {
    const a = { id: snap.key, ...snap.val() };
    if (!state.appointments.find(x => x.id === a.id)) { state.appointments.push(a); renderCurrentView(); }
});
database.ref('appointments').on('child_changed', snap => {
    const a = { id: snap.key, ...snap.val() };
    const i = state.appointments.findIndex(x => x.id === a.id);
    if (i !== -1) { state.appointments[i] = a; renderCurrentView(); }
});
database.ref('appointments').on('child_removed', snap => {
    state.appointments = state.appointments.filter(x => x.id !== snap.key);
    renderCurrentView();
});

// ==================== UTILITIES ====================

const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};
const isToday  = (d) => d === new Date().toISOString().split('T')[0];
const isFuture = (d) => d >  new Date().toISOString().split('T')[0];

const showToast = (msg, type = 'success') => {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 3200);
};

const openModal  = (id) => document.getElementById(id).classList.add('active');
const closeModal = (id) => document.getElementById(id).classList.remove('active');

// ==================== DURATION & TIME HELPERS ====================

/** Convert "HH:MM" to total minutes from midnight */
const timeToMins = (t) => {
    if (!t) return 0;
    const [h, m] = t.trim().split(':').map(Number);
    return h * 60 + m;
};

/** Add `mins` minutes to "HH:MM" → returns new "HH:MM" string */
const addMins = (t, mins) => {
    const total = timeToMins(t) + mins;
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
};

/** Format minutes as a readable label: 60→"1h", 90→"1h 30min", 30→"30min" */
const fmtDuration = (mins) => {
    if (!mins) return '';
    const m = parseInt(mins);
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h && r)  return `${h}h ${r}min`;
    if (h)       return `${h}h`;
    return `${r}min`;
};

/** Format 24h "HH:MM" → "H:MMam/pm" */
const fmt12 = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const suffix = h >= 12 ? 'pm' : 'am';
    const hh = h % 12 || 12;
    return `${hh}:${String(m).padStart(2,'0')}${suffix}`;
};

// ==================== ROOM AVAILABILITY (OVERLAP-BASED) ====================

/**
 * Returns true when a given room has a CONFLICTING appointment on `date`.
 * Conflict = the new slot [startMins, startMins+duration) overlaps an existing
 * slot [exStart, exStart+exDuration) in the same room.
 * excludeId = the appointment being edited (ignored in check).
 */
const hasRoomConflict = (room, date, startTime, durationMins, excludeId = '') => {
    if (!room || !date || !startTime || !durationMins) return false;
    const r       = room.trim().toLowerCase();
    const newS    = timeToMins(startTime);
    const newE    = newS + parseInt(durationMins);

    return state.appointments.some(a => {
        if (!a.room || a.room.trim().toLowerCase() !== r) return false;
        if (!a.date || a.date.trim() !== date.trim())     return false;
        if (a.status === 'cancelled')                      return false;
        if (a.id === excludeId)                            return false;

        const exS = timeToMins(a.time);
        const exE = exS + parseInt(a.duration || 60); // default 60min for old records

        // Overlap when one starts before the other ends
        return newS < exE && exS < newE;
    });
};

/** Get conflicting appointment details for a given slot (for error messages) */
const getConflict = (room, date, startTime, durationMins, excludeId = '') => {
    if (!room || !date || !startTime || !durationMins) return null;
    const r    = room.trim().toLowerCase();
    const newS = timeToMins(startTime);
    const newE = newS + parseInt(durationMins);

    return state.appointments.find(a => {
        if (!a.room || a.room.trim().toLowerCase() !== r) return false;
        if (!a.date || a.date.trim() !== date.trim())     return false;
        if (a.status === 'cancelled')                      return false;
        if (a.id === excludeId)                            return false;
        const exS = timeToMins(a.time);
        const exE = exS + parseInt(a.duration || 60);
        return newS < exE && exS < newE;
    }) || null;
};

/** Refresh which room buttons look occupied for a given date+startTime+duration */
const refreshRoomButtons = (date, time, durationMins, excludeId = '') => {
    const msg = document.getElementById('roomAvailabilityMsg');
    document.querySelectorAll('#roomPicker .room-btn').forEach(btn => {
        const room   = btn.getAttribute('data-room');
        const booked = date && time && durationMins &&
                       hasRoomConflict(room, date, time, durationMins, excludeId);
        btn.classList.toggle('occupied', booked);
        if (btn.classList.contains('selected') && booked) {
            btn.classList.remove('selected');
            state.selectedRoom = null;
            document.getElementById('appointmentRoom').value = '';
            if (msg) {
                msg.textContent = `⚠️ ${room} is occupied during this time slot. Please pick another room.`;
                msg.className   = 'warn';
            }
        }
    });
};

// ==================== NAVIGATION ====================

const switchView = (viewName) => {
    // Update desktop sidebar active state
    document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
    const desktopLink = document.querySelector(`.nav-links a[data-view="${viewName}"]`);
    if (desktopLink) desktopLink.classList.add('active');

    // Update mobile bottom nav active state
    document.querySelectorAll('.mob-nav-item').forEach(l => l.classList.remove('active'));
    const mobileLink = document.querySelector(`.mob-nav-item[data-view="${viewName}"]`);
    if (mobileLink) mobileLink.classList.add('active');

    // Switch visible view panel
    document.querySelectorAll('.view-content').forEach(v => v.classList.remove('active'));
    document.getElementById(`${viewName}View`).classList.add('active');

    const titles = {
        dashboard: 'Dashboard', calendar: 'Calendar',
        appointments: 'Appointments', customers: 'Customers',
        rooms: 'Rooms', history: 'History', settings: 'Settings'
    };
    document.getElementById('pageTitle').textContent = titles[viewName] || viewName;
    state.currentView = viewName;
    renderCurrentView();
};

// Desktop sidebar nav clicks
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', e => {
        e.preventDefault();
        switchView(link.getAttribute('data-view'));
    });
});

// Mobile bottom nav clicks
document.querySelectorAll('.mob-nav-item').forEach(link => {
    link.addEventListener('click', e => {
        e.preventDefault();
        switchView(link.getAttribute('data-view'));
    });
});

// ==================== RENDER DISPATCHER ====================

const renderCurrentView = () => {
    switch (state.currentView) {
        case 'dashboard':    renderDashboard();    break;
        case 'calendar':     renderCalendar();     break;
        case 'appointments': renderAppointments(); break;
        case 'customers':    renderCustomers();    break;
        case 'rooms':        renderRooms();        break;
        case 'history':      renderHistory();      break;
    }
};

// ==================== APPOINTMENT CARD ====================

const roomBadgeHtml = (room) =>
    room ? `<span class="room-badge"><i class="fas fa-door-open"></i>${room}</span>` : '';

const renderAppointmentCard = (apt) => {
    const customer     = state.customers.find(c => c.id === apt.customerId);
    const customerName = customer ? customer.name : 'Unknown Customer';
    const endTime      = apt.duration ? addMins(apt.time, apt.duration) : apt.endTime || '';
    const timeRange    = endTime ? `${fmt12(apt.time)} → ${fmt12(endTime)}` : fmt12(apt.time);
    const durLabel     = apt.duration ? `<span class="dur-badge"><i class="fas fa-hourglass-half"></i>${fmtDuration(apt.duration)}</span>` : '';
    return `
        <div class="appointment-card">
            <div class="appointment-info">
                <h4>${customerName} ${roomBadgeHtml(apt.room)}</h4>
                <p><i class="fas fa-briefcase"></i> ${apt.service} ${durLabel}</p>
                <p><i class="fas fa-clock"></i> ${timeRange} &bull; ${formatDate(apt.date)}</p>
                <span class="status-badge status-${apt.status}">${apt.status}</span>
            </div>
            <div class="appointment-actions">
                <button class="btn btn-small btn-whatsapp" onclick="sendWhatsAppReminder('${apt.id}')">
                    <i class="fab fa-whatsapp"></i>
                </button>
                <button class="btn btn-small btn-primary" onclick="editAppointment('${apt.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-small btn-danger" onclick="deleteAppointment('${apt.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>`;
};

// ==================== DASHBOARD ====================

const renderDashboard = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayApts    = state.appointments.filter(a => a.date === today);
    const upcomingApts = state.appointments.filter(a => a.date > today && a.status === 'scheduled')
                                           .sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time));
    const completedApts = state.appointments.filter(a => a.status === 'completed');

    document.getElementById('todayCount').textContent     = todayApts.length;
    document.getElementById('upcomingCount').textContent  = upcomingApts.length;
    document.getElementById('customersCount').textContent = state.customers.length;
    document.getElementById('completedCount').textContent = completedApts.length;

    const todayList = document.getElementById('todayList');
    todayList.innerHTML = todayApts.length
        ? todayApts.sort((a,b)=>a.time.localeCompare(b.time)).map(renderAppointmentCard).join('')
        : '<div class="empty-state"><i class="fas fa-calendar"></i><p>No appointments today</p></div>';

    const upcomingList = document.getElementById('upcomingList');
    upcomingList.innerHTML = upcomingApts.length
        ? upcomingApts.slice(0, 6).map(renderAppointmentCard).join('')
        : '<div class="empty-state"><i class="fas fa-calendar-check"></i><p>No upcoming appointments</p></div>';
};

// ==================== CALENDAR ====================

const renderCalendar = () => {
    const year  = state.currentMonth.getFullYear();
    const month = state.currentMonth.getMonth();

    document.getElementById('currentMonth').textContent =
        state.currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const firstDay      = new Date(year, month, 1).getDay();
    const daysInMonth   = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    let html = '';

    for (let i = firstDay - 1; i >= 0; i--)
        html += `<div class="calendar-day other-month"><span class="day-number">${prevMonthDays - i}</span></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr   = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const dayApts   = state.appointments.filter(a => a.date === dateStr);
        const classes   = ['calendar-day'];
        if (isToday(dateStr))                classes.push('today');
        if (state.selectedDate === dateStr)  classes.push('selected');

        const dots = dayApts.length
            ? `<div class="appointment-dots">${'<span class="appointment-dot"></span>'.repeat(Math.min(dayApts.length, 3))}</div>`
            : '';

        html += `<div class="${classes.join(' ')}" onclick="selectDate('${dateStr}')">
                    <span class="day-number">${day}</span>${dots}</div>`;
    }

    const totalCells     = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    const remainingCells = totalCells - (firstDay + daysInMonth);
    for (let d = 1; d <= remainingCells; d++)
        html += `<div class="calendar-day other-month"><span class="day-number">${d}</span></div>`;

    document.getElementById('calendarDays').innerHTML = html;
    if (state.selectedDate) showDayDetails(state.selectedDate);
};

window.selectDate = (dateStr) => {
    state.selectedDate = dateStr;
    renderCalendar();
    // Open new appointment modal with the clicked date pre-filled
    openNewAppointmentModal(dateStr);
};

const showDayDetails = (dateStr) => {
    const panel = document.getElementById('dayDetails');
    document.getElementById('selectedDate').textContent = formatDate(dateStr);
    const dayApts = state.appointments
        .filter(a => a.date === dateStr)
        .sort((a,b) => a.time.localeCompare(b.time));
    document.getElementById('dayAppointments').innerHTML = dayApts.length
        ? dayApts.map(renderAppointmentCard).join('')
        : '<div class="empty-state"><i class="fas fa-calendar"></i><p>No appointments on this day</p></div>';
    panel.classList.remove('hidden');
};

// ==================== APPOINTMENTS TABLE ====================

const renderAppointments = () => {
    const search       = (document.getElementById('searchAppointment')?.value || '').toLowerCase();
    const filterStatus = document.getElementById('filterStatus')?.value || '';
    const filterRoom   = document.getElementById('filterRoom')?.value   || '';
    const filterDate   = document.getElementById('filterDate')?.value   || '';

    let list = state.appointments;
    if (search)       list = list.filter(a => {
        const c = state.customers.find(x => x.id === a.customerId);
        return (c ? c.name.toLowerCase() : '').includes(search) || a.service.toLowerCase().includes(search);
    });
    if (filterStatus) list = list.filter(a => a.status === filterStatus);
    if (filterRoom)   list = list.filter(a => a.room === filterRoom);
    if (filterDate)   list = list.filter(a => a.date === filterDate);

    list = list.sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time));

    const container = document.getElementById('appointmentsList');
    if (!list.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><h3>No appointments found</h3></div>';
        return;
    }

    container.innerHTML = `
      <table class="appt-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Service</th>
            <th>Date</th>
            <th>Start</th>
            <th>End</th>
            <th>Duration</th>
            <th>Room</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(apt => {
              const c    = state.customers.find(x => x.id === apt.customerId);
              const name = c ? c.name : 'Unknown';
              const endT = apt.duration ? addMins(apt.time, apt.duration) : (apt.endTime || '');
              return `<tr>
                <td><strong>${name}</strong></td>
                <td>${apt.service}</td>
                <td>${formatDate(apt.date)}</td>
                <td><i class="fas fa-clock" style="color:var(--primary-color);margin-right:4px"></i>${fmt12(apt.time)}</td>
                <td>${endT ? `<i class="fas fa-flag-checkered" style="color:#10b981;margin-right:4px"></i>${fmt12(endT)}` : '—'}</td>
                <td>${apt.duration ? `<span class="dur-badge"><i class="fas fa-hourglass-half"></i>${fmtDuration(apt.duration)}</span>` : '—'}</td>
                <td>${apt.room ? `<span class="room-badge"><i class="fas fa-door-open"></i>${apt.room}</span>` : '—'}</td>
                <td><span class="status-badge status-${apt.status}">${apt.status}</span></td>
                <td>
                  <div class="actions">
                    <button class="btn btn-small btn-whatsapp" onclick="sendWhatsAppReminder('${apt.id}')" title="WhatsApp"><i class="fab fa-whatsapp"></i></button>
                    <button class="btn btn-small btn-primary"  onclick="editAppointment('${apt.id}')"      title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-small btn-danger"   onclick="deleteAppointment('${apt.id}')"   title="Delete"><i class="fas fa-trash"></i></button>
                  </div>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>`;
};

// ==================== ROOMS VIEW ====================

const renderRooms = () => {
    const picker = document.getElementById('roomsDatePicker');
    if (!picker.value) picker.value = new Date().toISOString().split('T')[0];
    const date = picker.value;

    const dayApts = state.appointments
        .filter(a => a.date === date && a.status !== 'cancelled')
        .sort((a,b) => a.time.localeCompare(b.time));

    const container = document.getElementById('roomsGrid');
    container.innerHTML = ROOMS.map(room => {
        const roomApts = dayApts.filter(a => a.room === room);
        const isFree   = roomApts.length === 0;

        const items = roomApts.length
            ? roomApts.map(apt => {
                const c    = state.customers.find(x => x.id === apt.customerId);
                const endT = apt.duration ? addMins(apt.time, apt.duration) : (apt.endTime || '');
                const timeLabel = endT
                    ? `${fmt12(apt.time)} – ${fmt12(endT)}`
                    : fmt12(apt.time);
                return `<div class="room-apt-item">
                    <div class="room-apt-time">${timeLabel}</div>
                    <div class="room-apt-info">
                        <strong>${c ? c.name : 'Unknown'}</strong>
                        <span>${apt.service}${apt.duration ? ' &bull; ' + fmtDuration(apt.duration) : ''} &bull; <span class="status-badge status-${apt.status}" style="font-size:11px;padding:2px 8px">${apt.status}</span></span>
                    </div>
                    <button class="btn btn-small btn-primary" onclick="editAppointment('${apt.id}')" title="Edit" style="margin-left:auto">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>`;
            }).join('')
            : `<div class="room-empty-msg"><i class="fas fa-door-open"></i>No appointments</div>`;

        return `<div class="room-card">
            <div class="room-card-header ${isFree ? 'free' : ''}">
                <h3><i class="fas fa-door-open"></i> ${room}</h3>
                <span class="room-status-pill">${isFree ? 'Free' : roomApts.length + ' booking' + (roomApts.length > 1 ? 's' : '')}</span>
            </div>
            <div class="room-card-body">${items}</div>
        </div>`;
    }).join('');
};

// Rooms date picker listener — wired after DOM ready
const initRoomsPicker = () => {
    const picker = document.getElementById('roomsDatePicker');
    if (picker) {
        picker.value = new Date().toISOString().split('T')[0];
        picker.addEventListener('change', () => {
            if (state.currentView === 'rooms') renderRooms();
        });
    }
};

// ==================== CUSTOMERS ====================

const renderCustomers = () => {
    const search = (document.getElementById('searchCustomer')?.value || '').toLowerCase();
    let list = state.customers;
    if (search) list = list.filter(c =>
        c.name.toLowerCase().includes(search) ||
        c.phone.includes(search) ||
        (c.email && c.email.toLowerCase().includes(search))
    );

    const container = document.getElementById('customersList');
    if (!list.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><h3>No customers found</h3><p>Add your first customer to get started</p></div>';
        return;
    }

    container.innerHTML = list.map(customer => {
        const apts      = state.appointments.filter(a => a.customerId === customer.id);
        const completed = apts.filter(a => a.status === 'completed').length;
        const upcoming  = apts.filter(a => a.status === 'scheduled' && isFuture(a.date)).length;
        return `
        <div class="customer-card">
            <h3>${customer.name}</h3>
            <p><i class="fas fa-phone"></i> ${customer.phone}</p>
            ${customer.email ? `<p><i class="fas fa-envelope"></i> ${customer.email}</p>` : ''}
            <div class="customer-stats">
                <div class="customer-stat"><div class="number">${apts.length}</div><div class="label">Total</div></div>
                <div class="customer-stat"><div class="number">${completed}</div><div class="label">Done</div></div>
                <div class="customer-stat"><div class="number">${upcoming}</div><div class="label">Upcoming</div></div>
            </div>
            <div class="btn-group">
                <button class="btn btn-small btn-primary"   onclick="editCustomer('${customer.id}')"><i class="fas fa-edit"></i> Edit</button>
                <button class="btn btn-small btn-secondary" onclick="viewCustomerHistory('${customer.id}')"><i class="fas fa-history"></i> History</button>
                <button class="btn btn-small btn-success"   onclick="quickBookAppointment('${customer.id}')"><i class="fas fa-calendar-plus"></i> Book</button>
                <button class="btn btn-small btn-danger"    onclick="deleteCustomer('${customer.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
};

// ==================== HISTORY ====================

const renderHistory = () => {
    const sel = document.getElementById('historyCustomer');
    // refresh options
    const current = sel.value;
    sel.innerHTML = '<option value="">Select customer...</option>';
    state.customers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id; opt.textContent = c.name;
        if (c.id === current) opt.selected = true;
        sel.appendChild(opt);
    });

    const cid = sel.value;
    const container = document.getElementById('historyList');

    if (!cid) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-user-clock"></i><p>Select a customer to view history</p></div>';
        return;
    }

    const customer = state.customers.find(c => c.id === cid);
    const apts = state.appointments
        .filter(a => a.customerId === cid)
        .sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time));

    if (!apts.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i><p>No appointments for this customer</p></div>';
        return;
    }

    const grouped = { completed: [], scheduled: [], cancelled: [], 'no-show': [] };
    apts.forEach(a => { if (grouped[a.status]) grouped[a.status].push(a); });

    let html = `<div class="customer-summary" style="margin-bottom:20px">
        <h2>${customer.name}</h2><p style="color:var(--text-secondary)">Total Appointments: ${apts.length}</p></div>`;

    Object.entries(grouped).forEach(([status, list]) => {
        if (!list.length) return;
        html += `<div class="history-group">
            <h3>${status.charAt(0).toUpperCase()+status.slice(1)} (${list.length})</h3>
            ${list.map(a => {
                const endT = a.duration ? addMins(a.time, a.duration) : (a.endTime || '');
                const timeRange = endT ? `${fmt12(a.time)} → ${fmt12(endT)}` : fmt12(a.time);
                return `<div class="history-item">
                    <p><strong>${a.service}</strong> ${roomBadgeHtml(a.room)} ${a.duration ? `<span class="dur-badge"><i class="fas fa-hourglass-half"></i>${fmtDuration(a.duration)}</span>` : ''}</p>
                    <p>${formatDate(a.date)} &bull; ${timeRange}</p>
                    ${a.notes ? `<p style="color:var(--text-secondary);font-size:13px"><em>${a.notes}</em></p>` : ''}
                </div>`;
            }).join('')}
        </div>`;
    });

    container.innerHTML = html;
};

// ==================== CUSTOMER CRUD ====================

window.editCustomer = (id) => {
    const c = state.customers.find(x => x.id === id);
    if (!c) return;
    state.editingCustomer = id;
    document.getElementById('customerModalTitle').textContent = 'Edit Customer';
    document.getElementById('customerId').value    = c.id;
    document.getElementById('customerName').value  = c.name;
    document.getElementById('customerPhone').value = c.phone;
    document.getElementById('customerEmail').value = c.email  || '';
    document.getElementById('customerNotes').value = c.notes || '';
    openModal('customerModal');
};

window.deleteCustomer = async (id) => {
    const c = state.customers.find(x => x.id === id);
    if (!c) return;
    const n = state.appointments.filter(a => a.customerId === id).length;
    if (!confirm(`Delete ${c.name}${n ? ` and ${n} appointment(s)` : ''}?`)) return;
    try {
        await deleteCustomerFromFirebase(id);
        showToast('Customer deleted');
    } catch { showToast('Error deleting customer', 'error'); }
};

window.viewCustomerHistory = (id) => {
    switchView('history');
    document.getElementById('historyCustomer').value = id;
    renderHistory();
};

window.quickBookAppointment = (id) => {
    openNewAppointmentModal();
    setTimeout(() => { document.getElementById('appointmentCustomer').value = id; }, 50);
};

// ==================== APPOINTMENT CRUD ====================

window.editAppointment = (id) => {
    const apt = state.appointments.find(a => a.id === id);
    if (!apt) return;

    state.editingAppointment = id;
    state.selectedRoom = apt.room || null;

    document.getElementById('appointmentModalTitle').textContent = 'Edit Appointment';
    document.getElementById('appointmentId').value        = apt.id;
    document.getElementById('appointmentDate').value      = apt.date;
    document.getElementById('appointmentTime').value      = apt.time;
    document.getElementById('appointmentDuration').value  = apt.duration || 60;
    document.getElementById('appointmentStatus').value    = apt.status;
    document.getElementById('appointmentNotes').value     = apt.notes || '';
    document.getElementById('appointmentRoom').value      = apt.room  || '';
    // Show computed end time
    if (apt.time && apt.duration) {
        document.getElementById('appointmentEndTime').value = fmt12(addMins(apt.time, parseInt(apt.duration)));
    }

    // Populate datalist and pre-fill the text input with the saved service
    populateServiceDropdown(apt.service);

    // Populate customer select
    const sel = document.getElementById('appointmentCustomer');
    sel.innerHTML = '<option value="">Select customer...</option>';
    state.customers.forEach(c => {
        const o = document.createElement('option');
        o.value = c.id; o.textContent = c.name;
        if (c.id === apt.customerId) o.selected = true;
        sel.appendChild(o);
    });

    // First mark occupied rooms (excluding the one being edited)
    refreshRoomButtons(apt.date, apt.time, apt.duration || 60, apt.id);

    // Then re-apply the selected highlight on the current room
    // (refreshRoomButtons may have cleared it if it found a conflict,
    //  but the appointment's own room must stay selectable since it excludes itself)
    document.querySelectorAll('#roomPicker .room-btn').forEach(btn => {
        const r = btn.getAttribute('data-room');
        if (r === apt.room) {
            btn.classList.add('selected');
            btn.classList.remove('occupied'); // can always re-select its own room
        }
    });

    const editMsg = document.getElementById('roomAvailabilityMsg');
    if (apt.room) {
        editMsg.textContent = `✅ ${apt.room} selected`;
        editMsg.className   = 'ok';
    }

    openModal('appointmentModal');
};

window.deleteAppointment = async (id) => {
    if (!confirm('Delete this appointment?')) return;
    try {
        await deleteAppointmentFromFirebase(id);
        showToast('Appointment deleted');
    } catch { showToast('Error deleting appointment', 'error'); }
};

window.sendWhatsAppReminder = (id) => {
    const apt = state.appointments.find(a => a.id === id);
    if (!apt) return;
    const c = state.customers.find(x => x.id === apt.customerId);
    if (!c) return;

    const msg = (state.settings.reminderMessage || '')
        .replace('{name}',    c.name)
        .replace('{service}', apt.service)
        .replace('{date}',    formatDate(apt.date))
        .replace('{time}',    apt.time)
        .replace('{room}',    apt.room || '');

    const phone = c.phone.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
};

// ==================== ROOM PICKER INTERACTIONS ====================

document.getElementById('roomPicker').addEventListener('click', e => {
    const btn = e.target.closest('.room-btn');
    if (!btn) return;
    if (btn.classList.contains('occupied')) {
        showToast(`${btn.getAttribute('data-room')} is already booked at this time!`, 'error');
        return;
    }
    // Deselect all, select clicked
    document.querySelectorAll('#roomPicker .room-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.selectedRoom = btn.getAttribute('data-room');
    document.getElementById('appointmentRoom').value = state.selectedRoom;

    const msg = document.getElementById('roomAvailabilityMsg');
    msg.textContent = `✅ ${state.selectedRoom} selected`;
    msg.className = 'ok';
});

// Auto-calculate end time + refresh rooms when date/time/duration change
const onSlotChange = () => {
    const date     = document.getElementById('appointmentDate').value;
    const time     = document.getElementById('appointmentTime').value;
    const duration = document.getElementById('appointmentDuration').value;
    const excl     = document.getElementById('appointmentId').value;

    // Show computed end time
    const endEl = document.getElementById('appointmentEndTime');
    if (time && duration) {
        endEl.value = fmt12(addMins(time, parseInt(duration)));
    } else {
        endEl.value = '';
    }

    // Refresh room availability
    if (date && time && duration) refreshRoomButtons(date, time, duration, excl);
};

['change', 'input'].forEach(evt => {
    document.getElementById('appointmentDate').addEventListener(evt,     onSlotChange);
    document.getElementById('appointmentTime').addEventListener(evt,     onSlotChange);
    document.getElementById('appointmentDuration').addEventListener(evt, onSlotChange);
});

// ==================== FORM: CUSTOMER ====================

document.getElementById('customerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const customer = {
        id:    document.getElementById('customerId').value,
        name:  document.getElementById('customerName').value.trim(),
        phone: document.getElementById('customerPhone').value.trim(),
        email: document.getElementById('customerEmail').value.trim(),
        notes: document.getElementById('customerNotes').value.trim()
    };
    try {
        await saveCustomerToFirebase(customer);
        showToast(customer.id ? 'Customer updated ✅' : 'Customer added ✅');
        closeModal('customerModal');
        document.getElementById('customerForm').reset();
        state.editingCustomer = null;
    } catch { showToast('Error saving customer', 'error'); }
});

// ==================== FORM: APPOINTMENT ====================

document.getElementById('appointmentForm').addEventListener('submit', async e => {
    e.preventDefault();

    const room     = document.getElementById('appointmentRoom').value;
    const date     = document.getElementById('appointmentDate').value;
    const time     = document.getElementById('appointmentTime').value;
    const duration = document.getElementById('appointmentDuration').value;
    const editId   = document.getElementById('appointmentId').value;

    if (!room)     { showToast('Please select a room!', 'error'); return; }
    if (!duration) { showToast('Please select a duration!', 'error'); return; }

    // Hard block: overlap check using full time range
    const conflict = getConflict(room, date, time, duration, editId);
    if (conflict) {
        const cust   = state.customers.find(c => c.id === conflict.customerId);
        const cName  = cust ? cust.name : 'another client';
        const endT   = addMins(conflict.time, parseInt(conflict.duration || 60));
        const msg    = document.getElementById('roomAvailabilityMsg');
        showToast(`❌ ${room} is occupied from ${fmt12(conflict.time)} to ${fmt12(endT)} (${cName}). Choose another room or time.`, 'error');
        refreshRoomButtons(date, time, duration, editId);
        document.querySelectorAll('#roomPicker .room-btn').forEach(b => {
            if (b.getAttribute('data-room') === room) {
                b.classList.remove('selected');
                b.classList.add('occupied');
            }
        });
        document.getElementById('appointmentRoom').value = '';
        state.selectedRoom = null;
        msg.textContent = `⛔ ${room} is busy ${fmt12(conflict.time)}–${fmt12(endT)}. Pick another room or time.`;
        msg.className   = 'warn';
        return;
    }

    const customerId = document.getElementById('appointmentCustomer').value;
    const customer   = state.customers.find(c => c.id === customerId);
    const endTime    = addMins(time, parseInt(duration));

    const appointment = {
        id:           editId,
        customerId:   customerId,
        customerName: customer ? customer.name : '',
        date,
        time,
        endTime,
        duration:    parseInt(duration),
        room,
        service: document.getElementById('appointmentService').value.trim(),
        status:  document.getElementById('appointmentStatus').value,
        notes:   document.getElementById('appointmentNotes').value.trim()
    };

    try {
        await saveAppointmentToFirebase(appointment);

        // Auto-save typed service if it's not already in the list (case-insensitive)
        const typedService = appointment.service;
        if (typedService && !state.services.some(s => s.name.toLowerCase() === typedService.toLowerCase())) {
            const svc = await addServiceToFirebase(typedService);
            if (!state.services.find(s => s.id === svc.id)) {
                state.services.push(svc);
                renderServicesList();
            }
        }

        showToast(editId ? 'Appointment updated ✅' : 'Appointment booked ✅');
        closeModal('appointmentModal');
        document.getElementById('appointmentForm').reset();
        state.editingAppointment = null;
        state.selectedRoom = null;
    } catch { showToast('Error saving appointment', 'error'); }
});

// ==================== SETTINGS ====================

document.getElementById('saveSettings').addEventListener('click', async () => {
    const settings = {
        whatsappNumber:  document.getElementById('whatsappNumber').value.trim(),
        reminderMessage: document.getElementById('reminderMessage').value.trim()
    };
    try {
        await saveSettingsToFirebase(settings);
        state.settings = settings;
        showToast('Settings saved ✅');
    } catch { showToast('Error saving settings', 'error'); }
});

// ==================== SERVICES UI ====================

/** Render services as pill chips in Settings + update the counter badge + sync datalist */
const renderServicesList = () => {
    const container = document.getElementById('servicesList');
    const badge     = document.getElementById('servicesTotalBadge');
    if (!container) return;

    const sorted = state.services.slice().sort((a, b) => a.name.localeCompare(b.name));

    // Update badge
    if (badge) badge.textContent = `${sorted.length} service${sorted.length !== 1 ? 's' : ''}`;

    if (!sorted.length) {
        container.innerHTML = `
            <div class="services-empty">
                <i class="fas fa-concierge-bell"></i>
                <p>No services yet</p>
                <small>Type a name above and press Enter or click Add</small>
            </div>`;
    } else {
        container.innerHTML = `
            <div class="services-chips">
                ${sorted.map(svc => `
                    <div class="service-chip">
                        <span>${svc.name}</span>
                        <button class="service-chip-del" onclick="removeService('${svc.id}')" title="Remove '${svc.name}'">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>`).join('')}
            </div>`;
    }

    // Keep the appointment form datalist in sync
    populateServiceDropdown();
};

/** Populate the service <select> dropdown + sync the text input */
const populateServiceDropdown = (currentValue = '') => {
    const sel = document.getElementById('appointmentServiceSelect');
    const inp = document.getElementById('appointmentService');
    if (!sel) return;

    const sorted = state.services.slice().sort((a, b) => a.name.localeCompare(b.name));

    sel.innerHTML = '<option value="">— Pick from saved services —</option>';
    sorted.forEach(svc => {
        const o = document.createElement('option');
        o.value = svc.name;
        o.textContent = svc.name;
        if (svc.name === currentValue) o.selected = true;
        sel.appendChild(o);
    });

    // Pre-fill text input when editing
    if (currentValue && inp) {
        inp.value = currentValue;
        sel.value = currentValue;  // also highlight in dropdown if it exists there
    }
};

// When user picks from the dropdown → copy value into text input
document.getElementById('appointmentServiceSelect')?.addEventListener('change', function () {
    const inp = document.getElementById('appointmentService');
    if (this.value && inp) {
        inp.value = this.value;
    }
});

// When user types in text input → reset the dropdown selection
document.getElementById('appointmentService')?.addEventListener('input', function () {
    const sel = document.getElementById('appointmentServiceSelect');
    if (sel) sel.value = '';
});

/** Add a new service */
document.getElementById('addServiceBtn').addEventListener('click', async () => {
    const input = document.getElementById('newServiceInput');
    const name  = input.value.trim();
    if (!name) { showToast('Please enter a service name', 'error'); return; }

    // Prevent duplicates (case-insensitive)
    if (state.services.some(s => s.name.toLowerCase() === name.toLowerCase())) {
        showToast(`"${name}" already exists`, 'error');
        return;
    }

    try {
        const svc = await addServiceToFirebase(name);
        // listener will push to state.services and re-render, but guard just in case
        if (!state.services.find(s => s.id === svc.id)) {
            state.services.push(svc);
            renderServicesList();
        }
        input.value = '';
        showToast(`Service "${name}" added ✅`);
    } catch { showToast('Error adding service', 'error'); }
});

// Allow pressing Enter in the input to add
document.getElementById('newServiceInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('addServiceBtn').click();
    }
});

/** Remove a service */
window.removeService = async (id) => {
    const svc = state.services.find(s => s.id === id);
    if (!svc) return;
    if (!confirm(`Remove service "${svc.name}"?`)) return;
    try {
        await removeServiceFromFirebase(id);
        state.services = state.services.filter(s => s.id !== id);
        renderServicesList();
        showToast(`Service "${svc.name}" removed`);
    } catch { showToast('Error removing service', 'error'); }
};

// ==================== MODAL CONTROLS ====================

const openNewCustomerModal = () => {
    state.editingCustomer = null;
    document.getElementById('customerModalTitle').textContent = 'New Customer';
    document.getElementById('customerForm').reset();
    openModal('customerModal');
};

const openNewAppointmentModal = (preselectedDate = '') => {
    state.editingAppointment = null;
    state.selectedRoom = null;
    document.getElementById('appointmentModalTitle').textContent = 'New Appointment';
    document.getElementById('appointmentForm').reset();
    document.getElementById('appointmentId').value       = '';
    document.getElementById('appointmentRoom').value     = '';
    document.getElementById('appointmentEndTime').value  = '';
    document.getElementById('appointmentDuration').value = '';

    const msg = document.getElementById('roomAvailabilityMsg');
    msg.textContent = '';
    msg.className   = '';

    // Use pre-selected date (from calendar click) or fall back to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('appointmentDate').value = preselectedDate || today;
    document.getElementById('appointmentTime').value = '';

    // Reset room buttons
    document.querySelectorAll('#roomPicker .room-btn').forEach(b => {
        b.classList.remove('selected', 'occupied');
    });

    // Populate customer dropdown
    const sel = document.getElementById('appointmentCustomer');
    sel.innerHTML = '<option value="">Select customer...</option>';
    state.customers.forEach(c => {
        const o = document.createElement('option');
        o.value = c.id; o.textContent = c.name;
        sel.appendChild(o);
    });

    // Populate service dropdown and clear any previous value
    populateServiceDropdown('');
    const svcSel = document.getElementById('appointmentServiceSelect');
    if (svcSel) svcSel.value = '';

    openModal('appointmentModal');
};

document.getElementById('newCustomerBtn').addEventListener('click',     openNewCustomerModal);
document.getElementById('newAppointmentBtn').addEventListener('click', openNewAppointmentModal);

// Mobile FAB button — top-right "+" button
document.getElementById('mobileNewApptBtn')?.addEventListener('click', openNewAppointmentModal);
document.getElementById('quickAddCustomer').addEventListener('click', () => {
    closeModal('appointmentModal');
    openNewCustomerModal();
});

document.querySelectorAll('[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.getAttribute('data-modal')));
});

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(modal.id); });
});

// ==================== CALENDAR NAVIGATION ====================

document.getElementById('prevMonth').addEventListener('click', () => {
    state.currentMonth.setMonth(state.currentMonth.getMonth() - 1);
    renderCalendar();
});
document.getElementById('nextMonth').addEventListener('click', () => {
    state.currentMonth.setMonth(state.currentMonth.getMonth() + 1);
    renderCalendar();
});

// ==================== FILTER LISTENERS ====================

document.getElementById('searchAppointment')?.addEventListener('input',  renderAppointments);
document.getElementById('filterStatus')?.addEventListener('change',      renderAppointments);
document.getElementById('filterRoom')?.addEventListener('change',        renderAppointments);
document.getElementById('filterDate')?.addEventListener('change',        renderAppointments);
document.getElementById('searchCustomer')?.addEventListener('input',     renderCustomers);
document.getElementById('historyCustomer')?.addEventListener('change',   renderHistory);

// ==================== REMINDERS ====================

const checkReminders = () => {
    const now = new Date();
    state.appointments.forEach(apt => {
        if (apt.status !== 'scheduled') return;
        const [h, m] = apt.time.split(':');
        const aptDT  = new Date(apt.date + 'T00:00:00');
        aptDT.setHours(parseInt(h), parseInt(m), 0, 0);
        const diff = aptDT - now;
        if (diff > 55*60*1000 && diff < 65*60*1000) {
            const c = state.customers.find(x => x.id === apt.customerId);
            if (c && confirm(`⏰ Reminder: ${c.name} — ${apt.service} in ${apt.room || ''} at ${apt.time}\n\nSend WhatsApp reminder now?`))
                sendWhatsAppReminder(apt.id);
        }
    });
};
setInterval(checkReminders, 60000);

// ==================== INIT ====================

window.addEventListener('DOMContentLoaded', () => {
    initRoomsPicker();
    loadDataFromFirebase();
    switchView('dashboard');
});
