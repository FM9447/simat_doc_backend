const admin = require('firebase-admin');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Initialize Firebase Admin
try {
  let serviceAccount;
  
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // If provided via Environment Variable (Best for Production/Azure)
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    debugPrint('✅ Firebase Admin: Using Environment Variable');
  } else {
    // Fallback to local file (Good for local development)
    serviceAccount = require('../firebase-service-account.json');
    debugPrint('✅ Firebase Admin: Using local JSON file');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.error('⚠️ Firebase Admin initialization failed. Push notifications will be disabled.', error.message);
}

// Helper for cleaner logging
function debugPrint(msg) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(msg);
  }
}

class NotificationService {
  /**
   * Sends a notification to a specific user (In-app + Push)
   */
  static async send(userId, message, type = 'info') {
    try {
      // 1. Save to Database for In-app list
      await Notification.create({ userId, message, type });

      // 2. Send Push Notification via FCM
      const user = await User.findById(userId);
      if (user && user.fcmTokens && user.fcmTokens.length > 0) {
        const payload = {
          notification: {
            title: this._getDisplayName(type),
            body: message,
          },
          // You can also add custom data here
          data: {
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
            type: type,
          }
        };

        const response = await admin.messaging().sendToDevice(user.fcmTokens, payload);
        console.log(`Successfully sent push to ${user.name}:`, response.successCount);
        
        // Optional: Clean up invalid tokens
        if (response.results) {
          response.results.forEach((result, index) => {
            const error = result.error;
            if (error) {
              console.error('Failure sending notification to', user.fcmTokens[index], error);
              if (error.code === 'messaging/invalid-registration-token' ||
                  error.code === 'messaging/registration-token-not-registered') {
                // Remove invalid token
                User.findByIdAndUpdate(userId, {
                  $pull: { fcmTokens: user.fcmTokens[index] }
                }).exec();
              }
            }
          });
        }
      }
    } catch (error) {
      console.error('Error in NotificationService.send:', error);
    }
  }

  static _getDisplayName(type) {
    switch (type) {
      case 'ok': return '✅ docTransit Approval';
      case 'err': return '❌ docTransit Update';
      default: return '🔔 docTransit Notification';
    }
  }
}

module.exports = NotificationService;
