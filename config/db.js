const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const dbUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smartcampus';
    const conn = await mongoose.connect(dbUri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
