/**
 * Alert Channels - Delivery methods for notifications
 *
 * Channels:
 * - notification: Desktop notification (default)
 * - voice: TTS announcement (if voice mode running)
 * - whatsapp: Message to configured WhatsApp group
 */

const notifier = require('node-notifier');
const path = require('path');

class AlertChannels {
  constructor(options = {}) {
    // Voice TTS handler (set by voice bridge when active)
    this.voiceHandler = options.voiceHandler || null;

    // WhatsApp handler (set by whatsapp bridge when active)
    this.whatsappHandler = options.whatsappHandler || null;

    // App name for notifications
    this.appName = options.appName || 'Jarvis';
  }

  /**
   * Send an alert through the specified channel
   */
  async send(reminder, channel = 'notification') {
    const channelToUse = channel || reminder.channel || 'notification';

    switch (channelToUse) {
      case 'notification':
        return this.sendNotification(reminder);

      case 'voice':
        return this.sendVoice(reminder);

      case 'whatsapp':
        return this.sendWhatsApp(reminder);

      case 'all':
        // Send to all available channels
        const results = await Promise.allSettled([
          this.sendNotification(reminder),
          this.sendVoice(reminder),
          this.sendWhatsApp(reminder)
        ]);
        return results;

      default:
        console.warn(`Unknown alert channel: ${channelToUse}, falling back to notification`);
        return this.sendNotification(reminder);
    }
  }

  /**
   * Send desktop notification
   */
  async sendNotification(reminder) {
    return new Promise((resolve, reject) => {
      notifier.notify(
        {
          title: this.appName,
          message: reminder.message,
          sound: true,
          wait: false,
          timeout: 10
        },
        (err, response) => {
          if (err) {
            console.error(`Notification error: ${err.message}`);
            reject(err);
          } else {
            console.log(`Notification sent: "${reminder.message}"`);
            resolve(response);
          }
        }
      );
    });
  }

  /**
   * Send voice announcement via TTS
   */
  async sendVoice(reminder) {
    if (!this.voiceHandler) {
      console.log('Voice handler not available, falling back to notification');
      return this.sendNotification(reminder);
    }

    try {
      await this.voiceHandler(reminder.message);
      console.log(`Voice alert sent: "${reminder.message}"`);
      return true;
    } catch (err) {
      console.error(`Voice alert error: ${err.message}`);
      // Fallback to notification
      return this.sendNotification(reminder);
    }
  }

  /**
   * Send WhatsApp message
   */
  async sendWhatsApp(reminder) {
    if (!this.whatsappHandler) {
      console.log('WhatsApp handler not available, falling back to notification');
      return this.sendNotification(reminder);
    }

    try {
      await this.whatsappHandler(reminder.message);
      console.log(`WhatsApp alert sent: "${reminder.message}"`);
      return true;
    } catch (err) {
      console.error(`WhatsApp alert error: ${err.message}`);
      // Fallback to notification
      return this.sendNotification(reminder);
    }
  }

  /**
   * Set voice handler
   */
  setVoiceHandler(handler) {
    this.voiceHandler = handler;
  }

  /**
   * Set WhatsApp handler
   */
  setWhatsAppHandler(handler) {
    this.whatsappHandler = handler;
  }

  /**
   * Check which channels are available
   */
  getAvailableChannels() {
    const channels = ['notification']; // Always available

    if (this.voiceHandler) {
      channels.push('voice');
    }

    if (this.whatsappHandler) {
      channels.push('whatsapp');
    }

    return channels;
  }
}

// Singleton instance
let instance = null;

function getAlertChannels(options = {}) {
  if (!instance) {
    instance = new AlertChannels(options);
  }
  return instance;
}

module.exports = {
  AlertChannels,
  getAlertChannels
};
