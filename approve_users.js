const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

const approveAll = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    const result = await User.updateMany({}, { $set: { isApproved: true } });
    console.log(`Updated ${result.modifiedCount} users to approved: true`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

approveAll();
