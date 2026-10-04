import { addRecord, getAllRecords } from './db.js';
const hash = p => window.dcodeIO.bcrypt.hashSync(p, 8);
export async function seedIfEmpty() {
  if ((await getAllRecords('categories')).length) return;
  const cats = [['Refrigerator','snow'],['Washing Machine','water'],['Air Conditioner','wind'],['Television','tv'],['Microwave','lightning-charge'],
    ['Water Heater','thermometer-sun'],['Cooler','fan'],['Mixer/Grinder','nut'],['Other Electronics','cpu']];
  const prices = [499,399,599,349,299,349,299,249,199];
  for (const [i, [name, icon]] of cats.entries()) {
    const c = await addRecord('categories', { id: 'cat' + i, name, icon, description: name + ' repair and servicing', status: 'Active' });
    await addRecord('services', { id: 'svc' + i, categoryId: c.id, serviceName: name + ' Repair', description: 'Diagnosis and repair of common faults', basePrice: prices[i], status: 'Active' });
  }
  await addRecord('users', { id:'admin1', name:'FixHub Admin', email:'admin@fixhub.local', mobile:'9000000000', passwordHash:hash('Admin@123'), address:'HQ', role:'admin', status:'Active' });
  await addRecord('users', { id:'user1', name:'Rohan Patil', email:'user@fixhub.local', mobile:'9111111111', passwordHash:hash('User@123'), address:'12 Station Road, Amravati', role:'customer', status:'Active' });
  const v = [['vendor1','CoolCare Repairs','Sunil Deshmukh','vendor@fixhub.local','Amravati','Refrigerator, Air Conditioner, Cooler',8,4.5],
             ['vendor2','HomeFix Services','Anil Kale','homefix@fixhub.local','Nagpur','Washing Machine, Television, Microwave',5,4]];
  for (const [id, shopName, ownerName, email, city, services, experience, rating] of v)
    await addRecord('vendors', { id, shopName, ownerName, email, mobile:'9222222222', passwordHash:hash('Vendor@123'), address:city+' Main Market', city, services, experience, workingHours:'9 AM - 7 PM', status:'Approved', role:'vendor', rating, ratingCount:1 });
  await addRecord('technicians', { id:'t1', vendorId:'vendor1', name:'Ravi More', mobile:'9333333333', skills:'Compressor, Gas filling', experience:6, availability:'Available', status:'Active' });
  await addRecord('technicians', { id:'t2', vendorId:'vendor2', name:'Imran Sheikh', mobile:'9444444444', skills:'Washer motors, TV boards', experience:4, availability:'Available', status:'Active' });
  await addRecord('bookings', { id:'FH-1001', userId:'user1', vendorId:'vendor1', technicianId:'t1', applianceType:'Refrigerator', serviceType:'Refrigerator Repair', problemDescription:'Not cooling properly', image:'', address:'12 Station Road, Amravati', bookingDate:'2026-09-20', bookingTime:'10:00', status:'Completed', estimatedCost:600, finalCost:650 });
  await addRecord('payments', { bookingId:'FH-1001', userId:'user1', amount:650, paymentMethod:'UPI Demo', paymentStatus:'Paid', paymentDate:new Date().toISOString() });
  await addRecord('reviews', { userId:'user1', userName:'Rohan Patil', vendorId:'vendor1', bookingId:'FH-1001', rating:5, comment:'Quick visit and fair price. Fridge cooling again.' });
}
