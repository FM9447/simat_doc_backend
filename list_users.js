const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

const listUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    const users = await User.find({}, 'name email role isApproved');
    console.log('--- USER LIST ---');
    users.forEach(u => {
      console.log(`${u.name} (${u.email}) - ${u.role} - Approved: ${u.isApproved}`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

listUsers();
