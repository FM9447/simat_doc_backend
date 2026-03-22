const mongoose = require('mongoose');
require('dotenv').config();
const Document = require('./models/Document');
const User = require('./models/User');

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Find the single valid approved principal
  const validPrincipal = await User.findOne({ role: 'principal', isApproved: true });
  if (!validPrincipal) {
    console.log("No valid principal found to reassign to!");
    process.exit();
  }

  const newId = validPrincipal._id.toString();
  
  // Find all documents where workflow includes 'principal'
  const docs = await Document.find({ workflow: 'principal' });
  let count = 0;
  
  for (const doc of docs) {
    if (doc.assigned && doc.assigned.get('principal') !== newId) {
      doc.assigned.set('principal', newId);
      await doc.save();
      count++;
    }
  }

  console.log(`Reassigned ${count} orphaned documents to the valid Principal (${newId}).`);
  process.exit();
}
fix();
