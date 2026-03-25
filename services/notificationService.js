const admin = require('firebase-admin');
const Notification = require('../models/Notification');
const User = require('../models/User');

function initializeFirebase() {
  if (admin.apps.length > 0) return true;

  console.log('--- 🚀 Firebase Admin: Initializing... ---');
  
  const tryInitialize = (serviceAccount, source) => {
    try {
      if (!serviceAccount || !serviceAccount.private_key) {
        throw new Error(`Missing mandatory fields in service account from ${source}`);
      }

      let key = serviceAccount.private_key;
      
      // Diagnostics: Log length and basic structure
      const keyLength = key.length;
      const hasBegin = key.includes('-----BEGIN PRIVATE KEY-----');
      const hasEnd = key.includes('-----END PRIVATE KEY-----');
      console.log(`📊 [${source}] Key Diagnostics: Length=${keyLength}, Has BEGIN=${hasBegin}, Has END=${hasEnd}`);

      // Aggressive sanitization
      key = key.replace(/\\n/g, '\n').trim();
      
      // Ensure standard PEM format
      if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
        key = `-----BEGIN PRIVATE KEY-----\n${key.replace(/\s/g, '\n')}\n-----END PRIVATE KEY-----`;
      }
      
      serviceAccount.private_key = key;

      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log(`✅ Firebase Admin: Initialized successfully via ${source}`);
      }
      return true;
    } catch (error) {
      console.error(`⚠️ [${source}] Initialization failed:`, error.message);
      if (error.stack && error.stack.includes('ASN.1')) {
        console.error('💡 TIP: This error usually means the private_key is truncated or malformed in your environment variables.');
      }
      return false;
    }
  };

  // 1. Try Environment Variable first
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (tryInitialize(sa, 'ENV_VAR')) return true;
    } catch (e) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e.message);
    }
  }

  // 2. Fallback to local file
  try {
    const sa = require('../firebase-service-account.json');
    if (tryInitialize(sa, 'LOCAL_JSON')) return true;
  } catch (e) {
    console.error('❌ Local JSON file not found or invalid:', e.message);
  }

  console.error('🛑 Firebase Admin: ALL initialization attempts failed.');
  return false;
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
