require('dotenv').config();
const mongoose = require('mongoose');
const DocumentType = require('../models/DocumentType');
const Document = require('../models/Document');

async function updateDB() {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('MONGODB_URI is not set in .env');
      process.exit(1);
    }
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Update all DocumentTypes
    const dtResult = await DocumentType.updateMany(
      { allowCustomHeading: { $exists: false } },
      { $set: { allowCustomHeading: false } }
    );
    console.log(`Updated ${dtResult.modifiedCount} DocumentTypes`);

    // Update all Documents
    const docResult = await Document.updateMany(
      { customHeading: { $exists: false } },
      { $set: { customHeading: '' } }
    );
    console.log(`Updated ${docResult.modifiedCount} Documents`);

  } catch (err) {
    console.error('Error updating DB:', err);
  } finally {
    mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  }
}

updateDB();
