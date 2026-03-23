const mongoose = require('mongoose');

const approvalSchema = mongoose.Schema({
  approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String }, // Role of the approver at the time of approval
  action: { type: String, enum: ['approved', 'rejected', 'forwarded'], required: true },
  comment: { type: String },
  signatureUrl: { type: String }, // Stored in Cloudinary
}, { timestamps: true });

const documentSchema = mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  customHeading: { type: String, default: '' },
  description: { type: String, default: '' },
  category: { 
    type: String, 
    required: true
  },
  flow: { type: String }, // Workflow/document type name (alias for category, for TSX compat)
  priority: { 
    type: String, 
    required: true,
    enum: ['low', 'medium', 'high', 'urgent']
  },
  status: { 
    type: String, 
    required: true,
    default: 'pending'
  },
  studentSignatureUrl: { type: String }, // Store student's digital signature for the request
  fileUrl: { type: String }, // Store the final generated PDF URL
  rejectionReason: { type: String },
  formData: { type: Map, of: mongoose.Schema.Types.Mixed }, // Stores { 'Reason': 'Higher Studies', 'Year': '2024' }
  workflow: [{ type: String }], // Array of role names e.g. ['tutor', 'hod', 'principal']
  assigned: { type: Map, of: mongoose.Schema.Types.Mixed }, // Map of role -> { id, name }
  approvals: [approvalSchema],
}, {
  timestamps: true,
});

const Document = mongoose.model('Document', documentSchema);
module.exports = Document;
