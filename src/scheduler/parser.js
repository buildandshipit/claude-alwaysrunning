/**
 * Time Parser - Natural language to Date/Cron conversion
 *
 * Uses chrono-node for natural language parsing
 */

const chrono = require('chrono-node');

/**
 * Parse natural language time expression
 * @param {string} text - Natural language time expression
 * @param {Date} referenceDate - Reference date for relative times
 * @returns {Object} Parsed time result
 */
function parseTime(text, referenceDate = new Date()) {
  // Check for cron-style recurring patterns first
  const cronResult = parseCronPattern(text);
  if (cronResult) {
    return {
      type: 'recurring',
      cron: cronResult.cron,
      description: cronResult.description
    };
  }

  // Use chrono for natural language parsing
  const results = chrono.parse(text, referenceDate);

  if (results.length === 0) {
    return null;
  }

  const result = results[0];
  const parsedDate = result.start.date();

  // Ensure the date is in the future
  if (parsedDate <= new Date()) {
    // If the time is in the past today, assume tomorrow
    if (result.start.get('day') === referenceDate.getDate()) {
      parsedDate.setDate(parsedDate.getDate() + 1);
    }
  }

  return {
    type: 'once',
    date: parsedDate,
    text: result.text
  };
}

/**
 * Parse cron-style recurring patterns
 * @param {string} text - Natural language recurring expression
 * @returns {Object|null} Cron expression result
 */
function parseCronPattern(text) {
  const lowerText = text.toLowerCase();

  // Every X minutes/hours
  let match = lowerText.match(/every\s+(\d+)\s+(minute|hour)s?/i);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'minute') {
      return {
        cron: `*/${value} * * * *`,
        description: `Every ${value} minute(s)`
      };
    } else {
      return {
        cron: `0 */${value} * * *`,
        description: `Every ${value} hour(s)`
      };
    }
  }

  // Every hour
  if (/every\s+hour/i.test(lowerText)) {
    return {
      cron: '0 * * * *',
      description: 'Every hour'
    };
  }

  // Every day at time
  match = lowerText.match(/every\s+day\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (match) {
    let hour = parseInt(match[1]);
    const minute = match[2] ? parseInt(match[2]) : 0;
    const ampm = match[3]?.toLowerCase();

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    return {
      cron: `${minute} ${hour} * * *`,
      description: `Every day at ${formatTime(hour, minute)}`
    };
  }

  // Every weekday at time
  match = lowerText.match(/every\s+weekday\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (match) {
    let hour = parseInt(match[1]);
    const minute = match[2] ? parseInt(match[2]) : 0;
    const ampm = match[3]?.toLowerCase();

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    return {
      cron: `${minute} ${hour} * * 1-5`,
      description: `Every weekday at ${formatTime(hour, minute)}`
    };
  }

  // Specific days of week
  const dayMap = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6
  };

  for (const [dayName, dayNum] of Object.entries(dayMap)) {
    const pattern = new RegExp(`every\\s+${dayName}\\s+at\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?`, 'i');
    match = lowerText.match(pattern);
    if (match) {
      let hour = parseInt(match[1]);
      const minute = match[2] ? parseInt(match[2]) : 0;
      const ampm = match[3]?.toLowerCase();

      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;

      return {
        cron: `${minute} ${hour} * * ${dayNum}`,
        description: `Every ${capitalize(dayName)} at ${formatTime(hour, minute)}`
      };
    }
  }

  return null;
}

/**
 * Parse relative time expression like "in 30 minutes"
 * @param {string} text - Relative time expression
 * @returns {Date|null} Calculated date
 */
function parseRelativeTime(text) {
  const lowerText = text.toLowerCase();

  const match = lowerText.match(/in\s+(\d+)\s+(second|minute|hour|day|week)s?/i);
  if (!match) {
    return null;
  }

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const now = new Date();

  switch (unit) {
    case 'second':
      return new Date(now.getTime() + value * 1000);
    case 'minute':
      return new Date(now.getTime() + value * 60 * 1000);
    case 'hour':
      return new Date(now.getTime() + value * 60 * 60 * 1000);
    case 'day':
      return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
    case 'week':
      return new Date(now.getTime() + value * 7 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

/**
 * Parse a time string for reminders
 * Handles both natural language and relative times
 * @param {string} text - Time expression
 * @returns {Object} Parsed result with date or cron
 */
function parseReminderTime(text) {
  // First try relative time (in X minutes)
  const relativeDate = parseRelativeTime(text);
  if (relativeDate) {
    return {
      type: 'once',
      date: relativeDate,
      text: text
    };
  }

  // Then try natural language
  return parseTime(text);
}

/**
 * Format hour and minute as readable time
 */
function formatTime(hour, minute) {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  const displayMinute = minute.toString().padStart(2, '0');
  return `${displayHour}:${displayMinute} ${ampm}`;
}

/**
 * Capitalize first letter
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Validate a cron expression
 * @param {string} expression - Cron expression
 * @returns {boolean} Whether the expression is valid
 */
function isValidCron(expression) {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const patterns = [
    /^(\*|(\d+|\*)(\/\d+)?|(\d+(-\d+)?)(,\d+(-\d+)?)*)$/, // minute
    /^(\*|(\d+|\*)(\/\d+)?|(\d+(-\d+)?)(,\d+(-\d+)?)*)$/, // hour
    /^(\*|(\d+|\*)(\/\d+)?|(\d+(-\d+)?)(,\d+(-\d+)?)*)$/, // day of month
    /^(\*|(\d+|\*)(\/\d+)?|(\d+(-\d+)?)(,\d+(-\d+)?)*)$/, // month
    /^(\*|(\d+|\*)(\/\d+)?|(\d+(-\d+)?)(,\d+(-\d+)?)*)$/, // day of week
  ];

  return parts.every((part, i) => patterns[i].test(part));
}

module.exports = {
  parseTime,
  parseCronPattern,
  parseRelativeTime,
  parseReminderTime,
  isValidCron
};
