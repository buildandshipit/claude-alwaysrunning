/**
 * Context Injection - Prepend context to Claude prompts
 *
 * Builds context from:
 * - Recent conversation history
 * - Relevant facts/preferences
 * - Pending reminders for today
 */

const { getMemoryStore } = require('./store');

class ContextBuilder {
  constructor(options = {}) {
    this.store = options.store || getMemoryStore();
    this.maxMessages = options.maxMessages || 10;
    this.maxFacts = options.maxFacts || 20;
  }

  /**
   * Build context string to prepend to prompts
   */
  buildContext(conversationId = null) {
    const parts = [];

    // Add facts/preferences
    const factsContext = this.buildFactsContext();
    if (factsContext) {
      parts.push(factsContext);
    }

    // Add today's reminders
    const remindersContext = this.buildRemindersContext();
    if (remindersContext) {
      parts.push(remindersContext);
    }

    // Add recent conversation history if provided
    if (conversationId) {
      const historyContext = this.buildHistoryContext(conversationId);
      if (historyContext) {
        parts.push(historyContext);
      }
    }

    if (parts.length === 0) {
      return null;
    }

    return `[JARVIS MEMORY CONTEXT]\n${parts.join('\n\n')}\n[END CONTEXT]\n\n`;
  }

  /**
   * Build context from stored facts/preferences
   */
  buildFactsContext() {
    const facts = this.store.getFacts();

    if (facts.length === 0) {
      return null;
    }

    // Group facts by category
    const grouped = {};
    for (const fact of facts.slice(0, this.maxFacts)) {
      const category = fact.category || 'general';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(fact.fact);
    }

    const lines = ['User Facts & Preferences:'];
    for (const [category, categoryFacts] of Object.entries(grouped)) {
      lines.push(`  ${category}:`);
      for (const fact of categoryFacts) {
        lines.push(`    - ${fact}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Build context from today's pending reminders
   */
  buildRemindersContext() {
    const reminders = this.store.getPendingReminders();

    if (reminders.length === 0) {
      return null;
    }

    // Filter to today's reminders
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayReminders = reminders.filter(r => {
      if (!r.trigger_at) return false;
      const triggerDate = new Date(r.trigger_at);
      return triggerDate >= today && triggerDate < tomorrow;
    });

    if (todayReminders.length === 0) {
      return null;
    }

    const lines = ["Today's Pending Reminders:"];
    for (const reminder of todayReminders) {
      const time = new Date(reminder.trigger_at).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      lines.push(`  - ${time}: ${reminder.message}`);
    }

    return lines.join('\n');
  }

  /**
   * Build context from recent conversation history
   */
  buildHistoryContext(conversationId) {
    const messages = this.store.getMessages(conversationId, this.maxMessages);

    if (messages.length === 0) {
      return null;
    }

    const lines = ['Recent Conversation:'];
    for (const msg of messages) {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      // Truncate long messages
      const content = msg.content.length > 200
        ? msg.content.substring(0, 200) + '...'
        : msg.content;
      lines.push(`  ${role}: ${content}`);
    }

    return lines.join('\n');
  }

  /**
   * Prepend context to a user message
   */
  wrapMessage(message, conversationId = null) {
    const context = this.buildContext(conversationId);
    if (context) {
      return context + message;
    }
    return message;
  }

  /**
   * Extract facts from Claude's response
   * Look for patterns like "I'll remember that..." or explicit memory commands
   */
  extractFacts(response) {
    const facts = [];

    // Pattern: "I'll remember that [fact]"
    const rememberPattern = /I'll remember that ([^.!?]+[.!?]?)/gi;
    let match;
    while ((match = rememberPattern.exec(response)) !== null) {
      facts.push({
        fact: match[1].trim(),
        category: 'general'
      });
    }

    // Pattern: "Noted: [fact]"
    const notedPattern = /Noted:?\s+([^.!?]+[.!?]?)/gi;
    while ((match = notedPattern.exec(response)) !== null) {
      facts.push({
        fact: match[1].trim(),
        category: 'general'
      });
    }

    return facts;
  }

  /**
   * Store extracted facts
   */
  storeFacts(facts) {
    for (const { fact, category } of facts) {
      this.store.addFact(fact, category);
    }
  }
}

// Singleton instance
let instance = null;

function getContextBuilder(options = {}) {
  if (!instance) {
    instance = new ContextBuilder(options);
  }
  return instance;
}

module.exports = {
  ContextBuilder,
  getContextBuilder
};
