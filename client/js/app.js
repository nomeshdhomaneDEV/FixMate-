import { initializeDB, addRecord, getRecord, getAllRecords, updateRecord, deleteRecord, queryRecords } from './db.js';
import { seedIfEmpty } from './seed.js';
const bc = () => window.dcodeIO.bcrypt;
const $ = s => document.querySelector(s), app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const money = n => '₹' + (n || 0);
const BADGE = { Pending:'warning', Accepted:'info', 'Technician Assigned':'info', 'In Progress':'primary', Completed:'success', Rejected:'danger', Cancelled:'secondary',
  Approved:'success', 'Pending Approval':'warning', Suspended:'danger', Paid:'success', Active:'success', Disabled:'danger' };
const badge = s => `<span class="badge text-bg-${BADGE[s] || 'secondary'}">${esc(s)}</span>`;
// Allowed status transitions (spec section 8) - enforced in setStatus()
const FLOW = { Pending:['Accepted','Rejected','Cancelled'], Accepted:['Technician Assigned','Cancelled'], 'Technician Assigned':['In Progress'], 'In Progress':['Completed'] };

function toast(msg, type = 'success') {
  const el = document.createElement('div'); el.className = `toast align-items-center text-bg-${type} border-0 show`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(msg)}</div></div>`; $('#toasts').append(el); setTimeout(() => el.remove(), 3500);
}
// ---------- session & auth ----------
const session = () => JSON.parse(localStorage.getItem('fh_session') || 'null');
async function me() { const s = session(); if (!s) return null; return await getRecord(s.role === 'vendor' ? 'vendors' : 'users', s.id) || null; }
async function notify(recipientId, title, message) { await addRecord('notifications', { recipientId, title, message, read: false }); }
async function login(email, password) {
  email = email.trim().toLowerCase();
  const u = (await queryRecords('users', x => x.email === email))[0] || (await queryRecords('vendors', x => x.email === email))[0];
  if (!u || !bc().compareSync(password, u.passwordHash)) throw new Error('Invalid email or password');
  if (u.status === 'Disabled') throw new Error('Account disabled');
  localStorage.setItem('fh_session', JSON.stringify({ id: u.id, role: u.role })); return u;
}
async function emailTaken(email) { return (await queryRecords('users', x => x.email === email)).length || (await queryRecords('vendors', x => x.email === email)).length; }
function validate(f, vendor) {
  if (!/^\S+@\S+\.\S+$/.test(f.email)) return 'Enter a valid email';
  if (!/^\d{10}$/.test(f.mobile)) return 'Mobile must be 10 digits';
  if (f.password.length < 6) return 'Password must be at least 6 characters';
  if (f.password !== f.confirm) return 'Passwords do not match';
  if (vendor && (!f.shopName || !f.city || !f.services)) return 'Fill all vendor fields'; return '';
}
// ---------- business logic ----------
async function setStatus(b, next, extra = {}) {
  if (!(FLOW[b.status] || []).includes(next)) throw new Error(`Cannot change ${b.status} to ${next}`);
  await updateRecord('bookings', b.id, { status: next, ...extra });
  const msg = { Accepted:'Booking accepted', Rejected:'Booking rejected', 'Technician Assigned':'Technician assigned', 'In Progress':'Repair started', Completed:'Repair completed', Cancelled:'Booking cancelled' }[next];
  await notify(b.userId, msg, `Booking ${b.id}: ${msg}`);
}
async function recalcRating(vendorId) {
  const r = await queryRecords('reviews', x => x.vendorId === vendorId);
  await updateRecord('vendors', vendorId, { rating: +(r.reduce((a, x) => a + x.rating, 0) / r.length).toFixed(1), ratingCount: r.length });
}
const stars = n => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
// ---------- layout ----------
async function layout() {
  const u = await me(); let links = '', right = '';
  if (u) {
    const un = (await queryRecords('notifications', n => n.recipientId === u.id && !n.read)).length;
    const home = { customer:'#/c', vendor:'#/v', admin:'#/a' }[u.role];
    links = `<li class="nav-item"><a class="nav-link" href="${home}">Dashboard</a></li>`;
    right = `<a class="btn btn-outline-secondary btn-sm position-relative me-2" href="#/notif"><i class="bi bi-bell"></i>${un ? `<span class="badge text-bg-danger ms-1">${un}</span>` : ''}</a>
      <span class="me-2 small">${esc(u.name || u.shopName)}</span><button class="btn btn-sm btn-primary" id="logout">Logout</button>`;
  } else right = `<a class="btn btn-outline-primary btn-sm me-2" href="#/login">Login</a><a class="btn btn-primary btn-sm" href="#/register">Register</a>`;
  $('#nav').innerHTML = `<nav class="navbar navbar-expand-lg bg-white border-bottom"><div class="container">
    <a class="navbar-brand" href="#/"><i class="bi bi-wrench-adjustable-circle"></i> FixHub</a>
    <button class="navbar-toggler" data-bs-toggle="collapse" data-bs-target="#nv"><span class="navbar-toggler-icon"></span></button>
    <div class="collapse navbar-collapse" id="nv"><ul class="navbar-nav me-auto">
      <li class="nav-item"><a class="nav-link" href="#/">Home</a></li><li class="nav-item"><a class="nav-link" href="#/services">Services</a></li>
      <li class="nav-item"><a class="nav-link" href="#/providers">Find Provider</a></li><li class="nav-item"><a class="nav-link" href="#/reviews">Reviews</a></li>
      <li class="nav-item"><a class="nav-link" href="#/about">About</a></li>${links}</ul><div class="d-flex align-items-center">${right}</div></div></div></nav>`;
  $('#logout')?.addEventListener('click', () => { localStorage.removeItem('fh_session'); location.hash = '#/'; });
  $('#foot').innerHTML = `<footer class="mt-5 py-4"><div class="container d-flex flex-wrap justify-content-between"><div><strong>FixHub</strong><br><small>Reliable Appliance Repair, Right When You Need It</small></div>
    <div><a href="#/services">Services</a> · <a href="#/providers">Providers</a> · <a href="#/about">About</a></div><div><small>© 2026 FixHub – college project demo</small></div></div></footer>`;
}
const guard = async role => { const u = await me(); if (!u || u.role !== role) { location.hash = '#/login'; return null; } return u; };
const table = (heads, rows, empty = 'Nothing found') => rows.length ? `<div class="table-responsive"><table class="table table-hover align-middle bg-white"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  : `<div class="text-center text-muted py-5 bg-white rounded border"><i class="bi bi-inbox fs-1"></i><p>${empty}</p></div>`;
const stat = (label, val, icon) => `<div class="col-6 col-md-3"><div class="card p-3"><div class="text-muted small"><i class="bi bi-${icon}"></i> ${label}</div><div class="fs-3 fw-bold">${val}</div></div></div>`;
// ---------- public pages ----------
const PAGES = {};
PAGES['/'] = async () => {
  const cats = await getAllRecords('categories'), rv = (await getAllRecords('reviews')).slice(0, 3);
  app.innerHTML = `<section class="hero row align-items-center g-3"><div class="col-md-7"><h1 class="fw-bold">Reliable Appliance Repair, Right When You Need It</h1>
    <p class="lead">FixHub connects you with verified local repair vendors. Pick your appliance, compare providers, book a visit, track the repair and pay – all in one place.</p>
    <a class="btn btn-primary me-2" href="#/c/book">Book a Repair</a><a class="btn btn-outline-primary" href="#/providers">Find a Service Provider</a></div>
    <div class="col-md-5 text-center"><i class="bi bi-tools art"></i></div></section>
    <h3 class="mt-5 mb-3">Appliance Categories</h3><div class="row g-3">${cats.map(c => `<div class="col-6 col-md-4 col-lg-3"><a class="text-decoration-none text-reset" href="#/c/book?cat=${c.id}"><div class="card cat-card"><i class="bi bi-${c.icon}"></i><div class="fw-semibold mt-2">${esc(c.name)}</div></div></a></div>`).join('')}</div>
    <h3 class="mt-5 mb-3">How FixHub Works</h3><div class="row g-3">${['Select Appliance','Choose Service','Find Provider','Book Repair','Track Repair','Pay & Review'].map((s, i) => `<div class="col-6 col-md-2 text-center"><span class="step">${i + 1}</span><div class="small mt-2">${s}</div></div>`).join('')}</div>
    <h3 class="mt-5 mb-3">Why Choose FixHub</h3><div class="row g-3">${[['patch-check','Verified Providers'],['calendar-check','Easy Booking'],['cash-coin','Transparent Charges'],['geo-alt','Repair Tracking'],['star','Customer Reviews']].map(([i, t]) => `<div class="col-6 col-md"><div class="card p-3 text-center"><i class="bi bi-${i} fs-3 text-primary"></i><div class="small fw-semibold">${t}</div></div></div>`).join('')}</div>
    <h3 class="mt-5 mb-3">Customer Reviews</h3><div class="row g-3">${rv.map(r => `<div class="col-md-4"><div class="card p-3"><div class="text-warning">${stars(r.rating)}</div><p class="mb-1">${esc(r.comment)}</p><small class="text-muted">— ${esc(r.userName)}</small></div></div>`).join('')}</div>
    <div class="card p-4 mt-5 text-center"><h4>Need an appliance repaired?</h4><div><a class="btn btn-primary" href="#/c/book">Book a Repair</a></div></div>`;
};
PAGES['/services'] = async () => {
  const sv = await getAllRecords('services'), cats = await getAllRecords('categories');
  app.innerHTML = `<h2>Repair Services</h2><div class="row g-3 mt-1">${sv.filter(s => s.status === 'Active').map(s => { const c = cats.find(x => x.id === s.categoryId) || {};
    return `<div class="col-md-6 col-lg-4"><div class="card p-3 h-100"><i class="bi bi-${c.icon} fs-2 text-primary"></i><h5 class="mt-2">${esc(s.serviceName)}</h5><p class="text-muted small">${esc(s.description)}</p>
    <div class="mt-auto d-flex justify-content-between align-items-center"><span>From <strong>${money(s.basePrice)}</strong></span><a class="btn btn-sm btn-primary" href="#/c/book?cat=${s.categoryId}">Book Now</a></div></div></div>`; }).join('')}</div>`;
};
PAGES['/about'] = async () => app.innerHTML = `<h2>About FixHub</h2><p>FixHub is a web platform that connects households with local appliance repair vendors. Finding a trustworthy technician is slow and prices are unclear – FixHub puts verified vendors, booking, tracking, payment records and reviews in one place.</p>
  <div class="row g-3"><div class="col-md-6"><div class="card p-3"><h5>For customers</h5><ul><li>Compare vendors by city, service and rating</li><li>Track every repair step</li><li>See estimates and final cost</li></ul></div></div>
  <div class="col-md-6"><div class="card p-3"><h5>For vendors</h5><ul><li>Receive organised repair requests</li><li>Manage technicians and earnings</li><li>Build reputation through reviews</li></ul></div></div></div>`;
PAGES['/reviews'] = async () => {
  const rv = await getAllRecords('reviews'), vs = await getAllRecords('vendors');
  app.innerHTML = `<h2>Customer Reviews</h2>${table(['Customer', 'Vendor', 'Rating', 'Comment'], rv.map(r => `<tr><td>${esc(r.userName)}</td><td>${esc(vs.find(v => v.id === r.vendorId)?.shopName)}</td><td class="text-warning">${stars(r.rating)}</td><td>${esc(r.comment)}</td></tr>`), 'No reviews yet')}`;
};
PAGES['/providers'] = async () => {
  const vs = (await getAllRecords('vendors')).filter(v => v.status === 'Approved'); const cats = await getAllRecords('categories');
  app.innerHTML = `<h2>Find a Service Provider</h2><div class="row g-2 mb-3"><div class="col-md-3"><input id="q" class="form-control" placeholder="Shop or owner name"></div><div class="col-md-3"><input id="city" class="form-control" placeholder="City"></div>
    <div class="col-md-3"><select id="ap" class="form-select"><option value="">Any appliance</option>${cats.map(c => `<option>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="col-md-3"><select id="rt" class="form-select"><option value="0">Any rating</option><option value="4">4★ &amp; up</option><option value="3">3★ &amp; up</option></select></div></div><div id="list" class="row g-3"></div>`;
  const draw = () => { const q = $('#q').value.toLowerCase(), city = $('#city').value.toLowerCase(), ap = $('#ap').value, rt = +$('#rt').value;
    const r = vs.filter(v => (v.shopName + v.ownerName).toLowerCase().includes(q) && v.city.toLowerCase().includes(city) && (!ap || v.services.includes(ap)) && v.rating >= rt);
    $('#list').innerHTML = r.length ? r.map(v => `<div class="col-md-6 col-lg-4"><div class="card p-3 h-100"><h5>${esc(v.shopName)}</h5><div class="small text-muted">${esc(v.ownerName)} · ${esc(v.city)}</div>
      <div class="my-2 small">${esc(v.services)}</div><div class="small">${v.experience} yrs experience · <span class="text-warning">${stars(v.rating)}</span> ${v.rating}</div><div class="my-2">${badge(v.status)}</div>
      <div class="mt-auto"><a class="btn btn-sm btn-outline-primary me-1" href="#/vendor/${v.id}">View Details</a><a class="btn btn-sm btn-primary" href="#/c/book?vendor=${v.id}">Book Repair</a></div></div></div>`).join('') : `<div class="text-center text-muted py-5">No providers match your search</div>`; };
  app.querySelectorAll('input,select').forEach(e => e.addEventListener('input', draw)); draw();
};
PAGES['/vendor'] = async id => {
  const v = await getRecord('vendors', id); if (!v) return app.innerHTML = '<p>Provider not found.</p>';
  const rv = await queryRecords('reviews', r => r.vendorId === id);
  app.innerHTML = `<div class="card p-4"><h3>${esc(v.shopName)} ${badge(v.status)}</h3><p class="text-muted">${esc(v.ownerName)} · ${esc(v.address)} · ${esc(v.workingHours)}</p><p>${esc(v.services)}</p>
    <p><span class="text-warning">${stars(v.rating)}</span> ${v.rating} (${v.ratingCount} reviews)</p><a class="btn btn-primary" href="#/c/book?vendor=${id}">Book Repair</a></div>
    <h5 class="mt-4">Reviews</h5>${table(['Customer', 'Rating', 'Comment'], rv.map(r => `<tr><td>${esc(r.userName)}</td><td class="text-warning">${stars(r.rating)}</td><td>${esc(r.comment)}</td></tr>`), 'No reviews yet')}`;
};
PAGES['/login'] = async () => {
  app.innerHTML = `<div class="row justify-content-center"><div class="col-md-5"><div class="card p-4"><h3>Login</h3><form id="f" novalidate><label class="form-label">Email</label><input class="form-control mb-3" name="email" type="email" required>
    <label class="form-label">Password</label><div class="input-group mb-3"><input class="form-control" name="password" id="pw" type="password" required><button class="btn btn-outline-secondary" type="button" id="eye"><i class="bi bi-eye"></i></button></div>
    <div class="d-flex justify-content-between mb-3"><label><input type="checkbox" checked> Remember me</label><a href="#" id="forgot">Forgot password?</a></div><button class="btn btn-primary w-100">Login</button></form>
    <p class="mt-3 mb-0 small">New here? <a href="#/register">Create Account</a></p></div></div></div>`;
  $('#eye').onclick = () => $('#pw').type = $('#pw').type === 'password' ? 'text' : 'password';
  $('#forgot').onclick = e => { e.preventDefault(); toast('Password reset is not available in the demo. Use Settings after login to change it.', 'warning'); };
  $('#f').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    try { const u = await login(f.email, f.password); toast('Welcome back!'); location.hash = { customer:'#/c', vendor:'#/v', admin:'#/a' }[u.role]; } catch (x) { toast(x.message, 'danger'); } };
};
PAGES['/register'] = async () => {
  app.innerHTML = `<div class="row justify-content-center"><div class="col-md-7"><div class="card p-4"><h3>Create Account</h3>
    <div class="btn-group mb-3"><input type="radio" class="btn-check" name="t" id="tc" checked><label class="btn btn-outline-primary" for="tc">Customer</label><input type="radio" class="btn-check" name="t" id="tv"><label class="btn btn-outline-primary" for="tv">Vendor</label></div>
    <form id="f" class="row g-2" novalidate><div class="col-md-6"><input class="form-control" name="name" placeholder="Your name" required></div><div class="col-md-6"><input class="form-control" name="mobile" placeholder="Mobile (10 digits)" required></div>
    <div class="col-12"><input class="form-control" name="email" type="email" placeholder="Email" required></div><div class="col-md-6"><input class="form-control" name="password" type="password" placeholder="Password" required></div>
    <div class="col-md-6"><input class="form-control" name="confirm" type="password" placeholder="Confirm password" required></div><div class="col-12"><input class="form-control" name="address" placeholder="Address" required></div>
    <div class="vend col-12 row g-2 m-0 p-0" hidden><div class="col-md-6"><input class="form-control" name="shopName" placeholder="Shop name"></div><div class="col-md-6"><input class="form-control" name="city" placeholder="City"></div>
    <div class="col-md-6"><input class="form-control" name="experience" type="number" min="0" placeholder="Experience (years)"></div><div class="col-md-6"><input class="form-control" name="workingHours" placeholder="Working hours"></div>
    <div class="col-12"><input class="form-control" name="services" placeholder="Services e.g. Refrigerator, Television"></div></div>
    <div class="col-12"><button class="btn btn-primary w-100">Register</button></div></form></div></div></div>`;
  const vend = () => $('.vend').hidden = !$('#tv').checked; $('#tc').onchange = $('#tv').onchange = vend;
  $('#f').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), isV = $('#tv').checked; f.email = f.email.trim().toLowerCase();
    const err = validate(f, isV); if (err) return toast(err, 'danger'); if (await emailTaken(f.email)) return toast('Email already registered', 'danger');
    const base = { email: f.email, mobile: f.mobile, address: f.address, passwordHash: bc().hashSync(f.password, 8) };
    if (isV) await addRecord('vendors', { ...base, shopName: f.shopName, ownerName: f.name, city: f.city, services: f.services, experience: +f.experience || 0, workingHours: f.workingHours || '9 AM - 6 PM', status: 'Pending Approval', role: 'vendor', rating: 0, ratingCount: 0 });
    else await addRecord('users', { ...base, name: f.name, role: 'customer', status: 'Active' }); // role is NEVER taken from the form
    toast(isV ? 'Registered. Wait for admin approval, then login.' : 'Registered. Please login.'); location.hash = '#/login'; };
};
// ---------- notifications ----------
PAGES['/notif'] = async () => {
  const u = await me(); if (!u) return location.hash = '#/login';
  const ns = (await queryRecords('notifications', n => n.recipientId === u.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  app.innerHTML = `<div class="d-flex justify-content-between"><h2>Notifications</h2><button class="btn btn-sm btn-outline-primary" id="all">Mark all as read</button></div>
    ${table(['When', 'Title', 'Message', ''], ns.map(n => `<tr class="${n.read ? '' : 'fw-bold'}"><td>${new Date(n.createdAt).toLocaleString()}</td><td>${esc(n.title)}</td><td>${esc(n.message)}</td><td>${n.read ? '' : `<button class="btn btn-sm btn-light" data-r="${n.id}">Mark read</button>`}</td></tr>`), 'No notifications')}`;
  app.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => { await updateRecord('notifications', b.dataset.r, { read: true }); route(); });
  $('#all').onclick = async () => { for (const n of ns.filter(x => !x.read)) await updateRecord('notifications', n.id, { read: true }); route(); };
};
// ---------- customer ----------
const bookingRows = (bs, vs, role) => bs.map(b => `<tr><td>${b.id}</td><td>${esc(b.applianceType)}</td><td>${esc(b.serviceType)}</td><td>${esc(vs.find(v => v.id === b.vendorId)?.shopName)}</td><td>${b.bookingDate}</td><td>${badge(b.status)}</td><td>${money(b.finalCost || b.estimatedCost)}</td><td><a class="btn btn-sm btn-outline-primary" href="#/booking/${b.id}">View</a></td></tr>`);
PAGES['/c'] = async () => {
  const u = await guard('customer'); if (!u) return;
  const bs = (await queryRecords('bookings', b => b.userId === u.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), vs = await getAllRecords('vendors'), ps = await getAllRecords('payments');
  const unpaid = bs.filter(b => b.status === 'Completed' && !ps.some(p => p.bookingId === b.id));
  app.innerHTML = `<div class="d-flex justify-content-between mb-3"><h2>Hello, ${esc(u.name)}</h2><a class="btn btn-primary" href="#/c/book">Book New Repair</a></div>
    <div class="row g-3 mb-4">${stat('Total Bookings', bs.length, 'list-check')}${stat('Active Repairs', bs.filter(b => ['Accepted', 'Technician Assigned', 'In Progress'].includes(b.status)).length, 'tools')}${stat('Completed', bs.filter(b => b.status === 'Completed').length, 'check-circle')}${stat('Pending', bs.filter(b => b.status === 'Pending').length, 'hourglass')}</div>
    ${unpaid.length ? `<div class="alert alert-warning">You have ${unpaid.length} completed repair(s) awaiting payment.</div>` : ''}
    <h5>My Bookings</h5>${table(['ID', 'Appliance', 'Service', 'Vendor', 'Date', 'Status', 'Amount', ''], bookingRows(bs, vs), 'No bookings found')}
    <h5 class="mt-4">Payment History</h5>${table(['Booking', 'Amount', 'Method', 'Status'], ps.filter(p => p.userId === u.id).map(p => `<tr><td>${p.bookingId}</td><td>${money(p.amount)}</td><td>${esc(p.paymentMethod)}</td><td>${badge(p.paymentStatus)}</td></tr>`), 'No payments yet')}`;
};
PAGES['/c/book'] = async () => {
  const u = await guard('customer'); if (!u) return; const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const cats = await getAllRecords('categories'), svs = await getAllRecords('services'), vs = (await getAllRecords('vendors')).filter(v => v.status === 'Approved');
  app.innerHTML = `<h2>Book a Repair</h2><form id="f" class="card p-4 row g-3" novalidate><div class="col-md-4"><label class="form-label">Appliance</label><select class="form-select" name="cat" required><option value="">Select</option>${cats.map(c => `<option value="${c.id}" ${qs.get('cat') === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="col-md-4"><label class="form-label">Service</label><select class="form-select" name="svc" required></select></div><div class="col-md-4"><label class="form-label">Vendor</label><select class="form-select" name="vendor" required><option value="">Select</option>${vs.map(v => `<option value="${v.id}" ${qs.get('vendor') === v.id ? 'selected' : ''}>${esc(v.shopName)} – ${esc(v.city)} (${v.rating}★)</option>`).join('')}</select></div>
    <div class="col-12"><label class="form-label">Problem description</label><textarea class="form-control" name="problem" rows="3" required></textarea></div><div class="col-md-6"><label class="form-label">Problem image (optional)</label><input class="form-control" type="file" name="img" accept="image/*"></div>
    <div class="col-md-6"><label class="form-label">Address</label><input class="form-control" name="address" value="${esc(u.address)}" required></div><div class="col-md-3"><label class="form-label">Date</label><input class="form-control" type="date" name="date" required></div>
    <div class="col-md-3"><label class="form-label">Time</label><input class="form-control" type="time" name="time" required></div><div class="col-md-6 d-flex align-items-end"><div class="fw-semibold">Estimated cost: <span id="est">–</span></div></div>
    <div class="col-12"><button class="btn btn-primary">Submit Repair Request</button></div></form>`;
  const fs = $('#f'), fillSvc = () => { const l = svs.filter(s => s.categoryId === fs.cat.value && s.status === 'Active'); fs.svc.innerHTML = l.map(s => `<option value="${s.id}">${esc(s.serviceName)} (from ${money(s.basePrice)})</option>`).join(''); est(); };
  const est = () => $('#est').textContent = money(svs.find(s => s.id === fs.svc.value)?.basePrice); fs.cat.onchange = fillSvc; fs.svc.onchange = est; fillSvc(); fs.date.min = new Date().toISOString().slice(0, 10);
  fs.onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(fs)); if (!f.cat || !f.svc || !f.vendor || !f.problem.trim() || !f.address.trim() || !f.date || !f.time) return toast('Please fill all required fields', 'danger');
    const file = fs.img.files[0]; if (file && file.size > 1.5e6) return toast('Image must be under 1.5 MB', 'danger');
    const image = file ? await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); }) : '';
    const s = svs.find(x => x.id === f.svc), id = 'FH-' + (1000 + (await getAllRecords('bookings')).length + 1);
    await addRecord('bookings', { id, userId: u.id, vendorId: f.vendor, technicianId: null, applianceType: cats.find(c => c.id === f.cat).name, serviceType: s.serviceName, problemDescription: f.problem, image, address: f.address, bookingDate: f.date, bookingTime: f.time, status: 'Pending', estimatedCost: s.basePrice, finalCost: null });
    await notify(f.vendor, 'New booking', `New repair request ${id}`); await notify(u.id, 'Booking submitted', `Your booking ID is ${id}`);
    toast('Booking submitted. ID: ' + id); location.hash = '#/booking/' + id; };
};
const STEPS = ['Pending', 'Accepted', 'Technician Assigned', 'In Progress', 'Completed'];
PAGES['/booking'] = async id => {
  const u = await me(); if (!u) return location.hash = '#/login'; const b = await getRecord('bookings', id);
  if (!b || (u.role === 'customer' && b.userId !== u.id) || (u.role === 'vendor' && b.vendorId !== u.id)) return app.innerHTML = '<div class="alert alert-danger">Booking not found or access denied.</div>';
  const cust = await getRecord('users', b.userId), v = await getRecord('vendors', b.vendorId), t = b.technicianId && await getRecord('technicians', b.technicianId);
  const pay = (await queryRecords('payments', p => p.bookingId === id))[0], rev = (await queryRecords('reviews', r => r.bookingId === id))[0];
  const idx = STEPS.indexOf(b.status), dead = ['Rejected', 'Cancelled'].includes(b.status);
  const tl = [...STEPS.map((s, i) => `<li class="${!dead && i < idx ? 'done' : !dead && i === idx ? 'now' : ''}">${s === 'Pending' ? 'Booking Submitted' : s}</li>`), `<li class="${pay ? 'done' : ''}">Payment Completed</li>`].join('');
  let actions = '';
  if (u.role === 'customer') {
    if (['Pending', 'Accepted'].includes(b.status)) actions += `<button class="btn btn-outline-danger me-2" id="cancel">Cancel Booking</button>`;
    if (b.status === 'Completed' && !pay) actions += `<div class="card p-3 mt-3"><h6>Pay ${money(b.finalCost)} <small class="text-muted">(demo simulation – not a real payment gateway)</small></h6><div class="input-group"><select class="form-select" id="pm"><option>Cash After Repair</option><option>UPI Demo</option><option>Card Demo</option></select><button class="btn btn-success" id="pay">Pay Now</button></div></div>`;
    if (b.status === 'Completed' && !rev) actions += `<div class="card p-3 mt-3"><h6>Rate this repair</h6><div class="input-group"><select class="form-select" id="rt" style="max-width:90px">${[5, 4, 3, 2, 1].map(n => `<option>${n}</option>`).join('')}</select><input class="form-control" id="cm" placeholder="Comment"><button class="btn btn-primary" id="rev">Submit</button></div></div>`;
  }
  if (u.role === 'vendor') {
    const techs = await queryRecords('technicians', x => x.vendorId === u.id && x.status === 'Active');
    if (b.status === 'Pending') actions = `<button class="btn btn-success me-2" id="acc">Accept</button><button class="btn btn-danger" id="rej">Reject</button>`;
    if (b.status === 'Accepted') actions = `<div class="row g-2"><div class="col-md-4"><select class="form-select" id="tech">${techs.map(x => `<option value="${x.id}">${esc(x.name)} (${x.availability})</option>`).join('')}</select></div><div class="col-md-3"><input class="form-control" id="est" type="number" min="0" value="${b.estimatedCost}"></div><div class="col-md-3"><button class="btn btn-primary" id="asg" ${techs.length ? '' : 'disabled'}>Assign Technician</button></div>${techs.length ? '' : '<div class="small text-danger">Add a technician first.</div>'}</div>`;
    if (b.status === 'Technician Assigned') actions = `<button class="btn btn-primary" id="start">Start Repair</button>`;
    if (b.status === 'In Progress') actions = `<div class="input-group" style="max-width:380px"><input class="form-control" id="fin" type="number" min="1" placeholder="Final cost" value="${b.estimatedCost}"><button class="btn btn-success" id="done">Complete Repair</button></div>`;
  }
  app.innerHTML = `<h2>Booking ${b.id} ${badge(b.status)}</h2><div class="row g-3"><div class="col-md-7"><div class="card p-3"><dl class="row mb-0">
    <dt class="col-4">Customer</dt><dd class="col-8">${esc(cust?.name)}</dd><dt class="col-4">Vendor</dt><dd class="col-8">${esc(v?.shopName)}</dd><dt class="col-4">Technician</dt><dd class="col-8">${t ? esc(t.name) : '—'}</dd>
    <dt class="col-4">Appliance / Service</dt><dd class="col-8">${esc(b.applianceType)} / ${esc(b.serviceType)}</dd><dt class="col-4">Problem</dt><dd class="col-8">${esc(b.problemDescription)}</dd>
    <dt class="col-4">Address</dt><dd class="col-8">${esc(b.address)}</dd><dt class="col-4">Date &amp; time</dt><dd class="col-8">${b.bookingDate} ${b.bookingTime}</dd><dt class="col-4">Estimated</dt><dd class="col-8">${money(b.estimatedCost)}</dd>
    <dt class="col-4">Final cost</dt><dd class="col-8">${b.finalCost ? money(b.finalCost) : '—'}</dd><dt class="col-4">Payment</dt><dd class="col-8">${badge(pay ? 'Paid' : 'Pending')} ${pay ? esc(pay.paymentMethod) : ''}</dd></dl>
    ${b.image ? `<img src="${b.image}" class="img-fluid mt-3 rounded" style="max-height:220px">` : ''}</div>${actions}</div>
    <div class="col-md-5"><div class="card p-3"><h6>Repair Timeline</h6><ul class="tl">${tl}</ul>${dead ? `<div class="alert alert-secondary mb-0">This booking was ${b.status.toLowerCase()}.</div>` : ''}</div></div></div>`;
  const on = (sel, fn) => $(sel)?.addEventListener('click', async () => { try { await fn(); route(); } catch (x) { toast(x.message, 'danger'); } });
  on('#cancel', async () => { if (confirm('Cancel this booking?')) { await setStatus(b, 'Cancelled'); await notify(b.vendorId, 'Booking cancelled', b.id); toast('Booking cancelled'); } });
  on('#acc', async () => { await setStatus(b, 'Accepted'); toast('Accepted'); }); on('#rej', async () => { await setStatus(b, 'Rejected'); toast('Rejected'); });
  on('#asg', async () => { await setStatus(b, 'Technician Assigned', { technicianId: $('#tech').value, estimatedCost: +$('#est').value }); await updateRecord('technicians', $('#tech').value, { availability: 'Busy' }); toast('Technician assigned'); });
  on('#start', async () => { await setStatus(b, 'In Progress'); toast('Repair started'); });
  on('#done', async () => { const c = +$('#fin').value; if (!(c > 0)) throw new Error('Enter a valid final cost'); await setStatus(b, 'Completed', { finalCost: c }); if (b.technicianId) await updateRecord('technicians', b.technicianId, { availability: 'Available' }); toast('Repair completed'); });
  on('#pay', async () => { await addRecord('payments', { bookingId: id, userId: u.id, amount: b.finalCost, paymentMethod: $('#pm').value, paymentStatus: 'Paid', paymentDate: new Date().toISOString() }); await notify(b.vendorId, 'Payment completed', `${id} paid`); await notify(u.id, 'Payment completed', `Payment for ${id} recorded`); toast('Payment recorded (demo)'); });
  on('#rev', async () => { await addRecord('reviews', { userId: u.id, userName: u.name, vendorId: b.vendorId, bookingId: id, rating: +$('#rt').value, comment: $('#cm').value.trim() || 'No comment' }); await recalcRating(b.vendorId); toast('Thanks for your review'); });
};
// ---------- vendor ----------
PAGES['/v'] = async () => {
  const u = await guard('vendor'); if (!u) return;
  if (u.status !== 'Approved') return app.innerHTML = `<div class="alert alert-warning"><h5>Account status: ${esc(u.status)}</h5>You can use the dashboard once an admin approves your shop.</div>`;
  const bs = (await queryRecords('bookings', b => b.vendorId === u.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), us = await getAllRecords('users'), ps = await getAllRecords('payments'), rv = await queryRecords('reviews', r => r.vendorId === u.id);
  const done = bs.filter(b => b.status === 'Completed'), paid = done.filter(b => ps.some(p => p.bookingId === b.id)), sum = l => l.reduce((a, b) => a + (b.finalCost || 0), 0);
  app.innerHTML = `<div class="d-flex justify-content-between"><h2>${esc(u.shopName)}</h2><a class="btn btn-outline-primary" href="#/v/techs">Manage Technicians</a></div>
    <div class="row g-3 my-2">${stat('New Requests', bs.filter(b => b.status === 'Pending').length, 'inbox')}${stat('Active Repairs', bs.filter(b => ['Accepted', 'Technician Assigned', 'In Progress'].includes(b.status)).length, 'tools')}${stat('Completed', done.length, 'check-circle')}${stat('Total Earnings', money(sum(paid)), 'cash-coin')}</div>
    <p class="text-muted">Paid: ${money(sum(paid))} · Pending payments: ${money(sum(done) - sum(paid))} · Rating ${u.rating} (${rv.length} reviews)</p>
    <h5>Booking Requests</h5>${table(['ID', 'Customer', 'Appliance', 'Service', 'Date', 'Location', 'Status', ''], bs.map(b => `<tr><td>${b.id}</td><td>${esc(us.find(x => x.id === b.userId)?.name)}</td><td>${esc(b.applianceType)}</td><td>${esc(b.serviceType)}</td><td>${b.bookingDate}</td><td>${esc(b.address)}</td><td>${badge(b.status)}</td><td><a class="btn btn-sm btn-outline-primary" href="#/booking/${b.id}">${b.status === 'Pending' ? 'Review' : 'Manage'}</a></td></tr>`), 'No requests yet')}
    <h5 class="mt-4">Reviews</h5>${table(['Customer', 'Rating', 'Comment'], rv.map(r => `<tr><td>${esc(r.userName)}</td><td class="text-warning">${stars(r.rating)}</td><td>${esc(r.comment)}</td></tr>`), 'No reviews yet')}`;
};
PAGES['/v/techs'] = async () => {
  const u = await guard('vendor'); if (!u) return; const ts = await queryRecords('technicians', t => t.vendorId === u.id);
  app.innerHTML = `<h2>Technicians</h2><form id="f" class="row g-2 mb-3 card p-3" novalidate><input type="hidden" name="id"><div class="col-md-3"><input class="form-control" name="name" placeholder="Name" required></div><div class="col-md-2"><input class="form-control" name="mobile" placeholder="Mobile" required></div>
    <div class="col-md-3"><input class="form-control" name="skills" placeholder="Skills" required></div><div class="col-md-1"><input class="form-control" name="experience" type="number" min="0" placeholder="Yrs"></div>
    <div class="col-md-2"><select class="form-select" name="availability"><option>Available</option><option>Busy</option><option>On Leave</option></select></div><div class="col-md-1"><button class="btn btn-primary w-100">Save</button></div></form>
    ${table(['Name', 'Mobile', 'Skills', 'Experience', 'Availability', ''], ts.map(t => `<tr><td>${esc(t.name)}</td><td>${esc(t.mobile)}</td><td>${esc(t.skills)}</td><td>${t.experience} yrs</td><td>${badge(t.availability === 'Available' ? 'Active' : 'Pending')} ${t.availability}</td>
    <td><button class="btn btn-sm btn-outline-primary" data-e="${t.id}">Edit</button> <button class="btn btn-sm btn-outline-danger" data-d="${t.id}">Delete</button></td></tr>`), 'No technicians added yet')}`;
  const fs = $('#f');
  app.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { const t = ts.find(x => x.id === b.dataset.e); for (const k of ['id', 'name', 'mobile', 'skills', 'experience', 'availability']) fs[k].value = t[k]; });
  app.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { if (confirm('Delete technician?')) { await deleteRecord('technicians', b.dataset.d); toast('Deleted'); route(); } });
  fs.onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(fs)); if (!f.name.trim() || !/^\d{10}$/.test(f.mobile) || !f.skills.trim()) return toast('Name, 10-digit mobile and skills are required', 'danger');
    const d = { name: f.name, mobile: f.mobile, skills: f.skills, experience: +f.experience || 0, availability: f.availability };
    if (f.id) await updateRecord('technicians', f.id, d); else await addRecord('technicians', { ...d, vendorId: u.id, status: 'Active' }); toast('Saved'); route(); };
};
// ---------- admin ----------
PAGES['/a'] = async () => {
  const u = await guard('admin'); if (!u) return;
  const [us, vs, ts, bs, ps, cs, sv, rv] = await Promise.all(['users', 'vendors', 'technicians', 'bookings', 'payments', 'categories', 'services', 'reviews'].map(getAllRecords));
  app.innerHTML = `<h2>Admin Dashboard</h2><div class="row g-3 mb-4">${stat('Users', us.filter(x => x.role === 'customer').length, 'people')}${stat('Vendors', vs.length, 'shop')}${stat('Technicians', ts.length, 'person-gear')}${stat('Bookings', bs.length, 'list-check')}
    ${stat('Pending Bookings', bs.filter(b => b.status === 'Pending').length, 'hourglass')}${stat('Completed', bs.filter(b => b.status === 'Completed').length, 'check-circle')}${stat('Cancelled', bs.filter(b => b.status === 'Cancelled').length, 'x-circle')}${stat('Revenue', money(ps.reduce((a, p) => a + p.amount, 0)), 'cash-coin')}</div>
    <h5>Vendors</h5>${table(['Shop', 'Owner', 'City', 'Status', 'Actions'], vs.map(v => `<tr><td>${esc(v.shopName)}</td><td>${esc(v.ownerName)}</td><td>${esc(v.city)}</td><td>${badge(v.status)}</td><td>
      ${[['Approved', 'Approve', 'success'], ['Rejected', 'Reject', 'warning'], ['Suspended', 'Suspend', 'secondary']].filter(a => a[0] !== v.status).map(([s, l, c]) => `<button class="btn btn-sm btn-outline-${c}" data-vs="${v.id}|${s}">${l}</button>`).join(' ')} <button class="btn btn-sm btn-outline-danger" data-del="vendors|${v.id}">Delete</button></td></tr>`))}
    <h5 class="mt-4">Users</h5><input id="uq" class="form-control mb-2" placeholder="Search name or email"><div id="ut"></div>
    <h5 class="mt-4">Categories</h5><form id="cf" class="input-group mb-2"><input class="form-control" name="name" placeholder="New category name" required><button class="btn btn-primary">Add</button></form>
    ${table(['Category', ''], cs.map(c => `<tr><td>${esc(c.name)}</td><td><button class="btn btn-sm btn-outline-primary" data-rn="${c.id}">Rename</button> <button class="btn btn-sm btn-outline-danger" data-del="categories|${c.id}">Delete</button></td></tr>`))}
    <h5 class="mt-4">All Bookings</h5>${table(['ID', 'Appliance', 'Vendor', 'Status', 'Amount', ''], bs.map(b => `<tr><td>${b.id}</td><td>${esc(b.applianceType)}</td><td>${esc(vs.find(v => v.id === b.vendorId)?.shopName)}</td><td>${badge(b.status)}</td><td>${money(b.finalCost || b.estimatedCost)}</td><td>${FLOW[b.status]?.includes('Cancelled') ? `<button class="btn btn-sm btn-outline-danger" data-cb="${b.id}">Cancel</button>` : ''}</td></tr>`))}
    <h5 class="mt-4">Reviews</h5>${table(['Customer', 'Vendor', 'Rating', 'Comment', ''], rv.map(r => `<tr><td>${esc(r.userName)}</td><td>${esc(vs.find(v => v.id === r.vendorId)?.shopName)}</td><td>${r.rating}★</td><td>${esc(r.comment)}</td><td><button class="btn btn-sm btn-outline-danger" data-rd="${r.id}">Delete</button></td></tr>`), 'No reviews')}`;
  const drawU = () => { const q = $('#uq').value.toLowerCase(); $('#ut').innerHTML = table(['Name', 'Email', 'Role', 'Status', ''], us.filter(x => (x.name + x.email).toLowerCase().includes(q)).map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.email)}</td><td>${x.role}</td><td>${badge(x.status)}</td><td>${x.role === 'admin' ? '' : `<button class="btn btn-sm btn-outline-secondary" data-ut="${x.id}">${x.status === 'Active' ? 'Disable' : 'Enable'}</button> <button class="btn btn-sm btn-outline-danger" data-del="users|${x.id}">Delete</button>`}</td></tr>`), 'No users match');
    app.querySelectorAll('[data-ut]').forEach(b => b.onclick = async () => { const x = us.find(y => y.id === b.dataset.ut); await updateRecord('users', x.id, { status: x.status === 'Active' ? 'Disabled' : 'Active' }); route(); });
    app.querySelectorAll('#ut [data-del]').forEach(bindDel); }; $('#uq').oninput = drawU; drawU();
  function bindDel(b) { b.onclick = async () => { const [s, id] = b.dataset.del.split('|'); if (confirm('Delete permanently?')) { await deleteRecord(s, id); toast('Deleted'); route(); } }; }
  app.querySelectorAll('[data-del]').forEach(bindDel);
  app.querySelectorAll('[data-vs]').forEach(b => b.onclick = async () => { const [id, s] = b.dataset.vs.split('|'); await updateRecord('vendors', id, { status: s }); if (s === 'Approved') await notify(id, 'Vendor approved', 'Your shop is now live on FixHub'); toast('Vendor ' + s.toLowerCase()); route(); });
  app.querySelectorAll('[data-rd]').forEach(b => b.onclick = async () => { const r = rv.find(x => x.id === b.dataset.rd); if (confirm('Delete review?')) { await deleteRecord('reviews', r.id); if ((await queryRecords('reviews', x => x.vendorId === r.vendorId)).length) await recalcRating(r.vendorId); else await updateRecord('vendors', r.vendorId, { rating: 0, ratingCount: 0 }); route(); } });
  app.querySelectorAll('[data-cb]').forEach(b => b.onclick = async () => { await setStatus(bs.find(x => x.id === b.dataset.cb), 'Cancelled'); route(); });
  app.querySelectorAll('[data-rn]').forEach(b => b.onclick = async () => { const n = prompt('New name'); if (n?.trim()) { await updateRecord('categories', b.dataset.rn, { name: n.trim() }); route(); } });
  $('#cf').onsubmit = async e => { e.preventDefault(); await addRecord('categories', { name: e.target.name.value.trim(), icon: 'cpu', description: '', status: 'Active' }); toast('Category added'); route(); };
};
// ---------- router ----------
async function route() {
  await layout(); const [path, ...rest] = (location.hash.slice(1).split('?')[0] || '/').split('/').filter((x, i) => i || x !== '');
  const full = '/' + [path, ...rest].filter(Boolean).join('/'); const key = PAGES[full] ? full : '/' + (path || '');
  try { const h = PAGES[key] || PAGES['/' + path]; if (!h) { app.innerHTML = '<div class="text-center py-5"><h3>Page not found</h3><a href="#/">Go home</a></div>'; return; }
    await h(key === full ? undefined : rest[0]); } catch (e) { console.error(e); app.innerHTML = '<div class="alert alert-danger">Something went wrong. Please refresh.</div>'; }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
(async () => { try { await initializeDB(); await seedIfEmpty(); } catch (e) { app.innerHTML = '<div class="alert alert-danger">Database failed to start: ' + esc(e.message) + '</div>'; return; } route(); })();
