import { useState, useEffect, useCallback } from 'react';

interface MemoryStats {
  conversations: number;
  messages: number;
  facts: number;
  reminders: {
    pending: number;
    completed: number;
    cancelled: number;
  };
}

interface Fact {
  id: number;
  fact: string;
  category: string;
  created_at: string;
}

interface Conversation {
  id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
}

interface Message {
  id: number;
  conversation_id: string;
  role: string;
  content: string;
  timestamp: string;
}

export function useMemory() {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    // Set up event listeners
    const unsubStats = window.electronAPI.onMemoryStats((data: MemoryStats) => {
      setStats(data);
    });

    const unsubFacts = window.electronAPI.onMemoryFacts((data: Fact[]) => {
      setFacts(data);
    });

    const unsubFactAdded = window.electronAPI.onFactAdded((data: Fact) => {
      setFacts((prev) => [data, ...prev]);
      // Update stats
      setStats((prev) => prev ? { ...prev, facts: prev.facts + 1 } : null);
    });

    const unsubFactDeleted = window.electronAPI.onFactDeleted((data: { id: number }) => {
      setFacts((prev) => prev.filter((f) => f.id !== data.id));
      // Update stats
      setStats((prev) => prev ? { ...prev, facts: prev.facts - 1 } : null);
    });

    const unsubConversations = window.electronAPI.onConversations((data: Conversation[]) => {
      setConversations(data);
    });

    const unsubMessages = window.electronAPI.onMessages((data: Message[]) => {
      setMessages(data);
    });

    return () => {
      unsubStats();
      unsubFacts();
      unsubFactAdded();
      unsubFactDeleted();
      unsubConversations();
      unsubMessages();
    };
  }, []);

  const refreshStats = useCallback(() => {
    window.electronAPI.requestMemoryStats();
  }, []);

  const refreshFacts = useCallback((category?: string) => {
    setSelectedCategory(category || null);
    window.electronAPI.requestFacts(category);
  }, []);

  const addFact = useCallback((fact: string, category: string = 'general') => {
    window.electronAPI.addFact(fact, category);
  }, []);

  const deleteFact = useCallback((id: number) => {
    window.electronAPI.deleteFact(id);
  }, []);

  const refreshConversations = useCallback((limit: number = 10) => {
    window.electronAPI.requestConversations(limit);
  }, []);

  const loadMessages = useCallback((conversationId: string, limit: number = 100) => {
    window.electronAPI.requestMessages(conversationId, limit);
  }, []);

  // Get unique categories from facts
  const categories = Array.from(new Set(facts.map((f) => f.category)));

  return {
    stats,
    facts,
    conversations,
    messages,
    categories,
    selectedCategory,
    refreshStats,
    refreshFacts,
    addFact,
    deleteFact,
    refreshConversations,
    loadMessages
  };
}
