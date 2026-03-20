const mongoose = require('mongoose');

const notificationSchema = mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['info', 'ok', 'err'], default: 'info' },
  read: { type: Boolean, default: false },
}, {
  timestamps: true,
});

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;
