const mongoose = require('mongoose');

const elementSchema = mongoose.Schema({
  id: { type: String, required: true },
  kind: { type: String, enum: ['field', 'system', 'header', 'address', 'divider', 'seal', 'header_image'], default: 'field' },
  label: { type: String },
  type: { type: String, enum: ['text', 'number', 'date', 'textarea', 'select', 'checkbox'], default: 'text' },
  required: { type: Boolean, default: false },
  visible: { type: Boolean, default: true },
  options: [{ type: String }],
  sysKey: { type: String },
  content: { type: String },
  imageUrl: { type: String }, // For seals and header images
  x: { type: Number, default: 20 },
  y: { type: Number, default: 20 },
  w: { type: Number, default: 200 },
  h: { type: Number, default: 30 },
}, { _id: false });

const documentTypeSchema = mongoose.Schema({
  name: { type: String, required: true, unique: true },
  steps: [{ 
    type: String, 
    enum: ['tutor', 'hod', 'principal', 'office', 'admin'],
    required: true 
  }],
  elements: [elementSchema], // Form field definitions
  letterTemplate: { type: String, default: '' }, // Template with {{placeholders}}
  allowCustomHeading: { type: Boolean, default: false },
  includeLetterhead: { type: Boolean, default: true },
  includeRefDate: { type: Boolean, default: true },
  includeSeal: { type: Boolean, default: false },
  customHeaderUrl: { type: String },
  customApprovedSealUrl: { type: String },
  customRejectedSealUrl: { type: String },
  isFormBased: { type: Boolean, default: false },
  requiredFields: [{ type: String }], // Legacy — kept for backwards compat
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true,
});

const DocumentType = mongoose.model('DocumentType', documentTypeSchema);
module.exports = DocumentType;
