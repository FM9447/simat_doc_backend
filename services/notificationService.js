const admin = require('firebase-admin');
const Notification = require('../models/Notification');
const User = require('../models/User');

function initializeFirebase() {
  if (admin.apps.length > 0) return true;

  try {
    let serviceAccount;
    
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      console.log('✅ Firebase Admin: Using Environment Variable');
    } else {
      // Fallback to local file
      try {
        serviceAccount = require('../firebase-service-account.json');
        console.log('✅ Firebase Admin: Using local JSON file');
      } catch (e) {
        console.error('❌ Firebase Admin: Local JSON file not found or invalid:', e.message);
        return false;
      }
    }

    if (serviceAccount && serviceAccount.private_key) {
      let key = serviceAccount.private_key;
      key = key.replace(/\\n/g, '\n');
      
      if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
        key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
      }
      
      serviceAccount.private_key = key;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase Admin: Cloud Messaging Initialized');
    }
    return true;
  } catch (error) {
    console.error('⚠️ Firebase Admin initialization failed:', error.stack || error.message);
    return false;
  }
}

// Initial attempt
initializeFirebase();

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
        const messages = user.fcmTokens.map(token => ({
          token: token,
          notification: {
            title: NotificationService._getDisplayName(type),
            body: message,
          },
          android: {
            notification: {
              icon: 'ic_launcher',
              clickAction: 'FLUTTER_NOTIFICATION_CLICK',
              channelId: 'doctransit_channel',
              priority: 'high',
              sound: 'default'
            }
          },
          data: {
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
            type: type,
          }
        }));

        // Ensure initialized before sending
        if (admin.apps.length === 0) {
          console.log('🔄 Attempting re-initialization of Firebase Admin...');
          initializeFirebase();
        }

        const isInitialized = admin.apps.length > 0;
        
        const response = isInitialized 
          ? await admin.messaging().sendEach(messages)
          : { successCount: 0, responses: [] };
        
        if (isInitialized) {
          console.log(`Successfully sent push to ${user.name}:`, response.successCount);
        } else {
          console.log(`❌ Push skipped for ${user.name} (Firebase could not be initialized)`);
        }
        
        // Optional: Clean up invalid tokens
        if (response.responses) {
          response.responses.forEach((res, index) => {
            if (!res.success && res.error) {
              const error = res.error;
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
