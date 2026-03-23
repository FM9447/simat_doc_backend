const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    required: true, 
    enum: ['student', 'tutor', 'hod', 'principal', 'office', 'admin'],
    default: 'student'
  },
  registerNo: { type: String }, // For students
  dept: { type: String },       // Legacy (string) — keeping for now, but will transition to departmentId
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For students
  year: { type: Number },     // 1, 2, 3, 4
  division: { type: String }, // A, B, C
  hodOfDeptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' }, // For HODs
  delegatedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Vacation/Leave Mode
  signatureUrl: { type: String }, // Stored in Cloudinary
  isApproved: { type: Boolean, default: false },
  fcmTokens: [{ type: String }],
}, {
  timestamps: true,
});

const User = mongoose.model('User', userSchema);
module.exports = User;
