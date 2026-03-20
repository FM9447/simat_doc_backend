const mongoose = require('mongoose');

const departmentSchema = mongoose.Schema({
  name: { type: String, required: true, unique: true },
  hodId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // The current HOD
}, {
  timestamps: true,
});

const Department = mongoose.model('Department', departmentSchema);
module.exports = Department;
