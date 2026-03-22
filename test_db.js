const mongoose = require('mongoose');
require('dotenv').config();
const Document = require('./models/Document');
const User = require('./models/User');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const docs = await Document.find().sort({createdAt: -1}).limit(2);
  console.log("Latest Docs:", JSON.stringify(docs.map(d => ({ title: d.title, workflow: d.workflow, assigned: d.assigned })), null, 2));

  const principals = await User.find({ role: 'principal' });
  console.log("Principals in DB:", JSON.stringify(principals.map(u => ({ email: u.email, id: u._id, isApproved: u.isApproved })), null, 2));

  process.exit();
}
check();
