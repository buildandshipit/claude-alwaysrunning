import { useState, useEffect, useCallback, useRef } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentOutput, setCurrentOutput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const outputRef = useRef('');
  const idCounter = useRef(0);

  useEffect(() => {
    // Listen for Claude output
    const unsubOutput = window.electronAPI.onClaudeOutput((data: string) => {
      // Accumulate streaming output
      outputRef.current += data;
      setCurrentOutput(outputRef.current);
      setIsStreaming(true);
    });

    // Listen for history
    const unsubHistory = window.electronAPI.onHistory((data: string) => {
      // Parse history into messages (simplified - just show as terminal output)
      if (data.trim()) {
        setCurrentOutput(data);
      }
    });

    // Request history on mount
    window.electronAPI.requestHistory(50);

    return () => {
      unsubOutput();
      unsubHistory();
    };
  }, []);

  const sendMessage = useCallback((content: string) => {
    // Add user message
    const userMessage: Message = {
      id: `msg-${++idCounter.current}`,
      role: 'user',
      content,
      timestamp: new Date()
    };
    setMessages((prev) => [...prev, userMessage]);

    // Clear current output for new response
    outputRef.current = '';
    setCurrentOutput('');
    setIsStreaming(true);

    // Send command to Claude
    window.electronAPI.sendCommand(content);
  }, []);

  const finalizeResponse = useCallback(() => {
    if (outputRef.current.trim()) {
      const assistantMessage: Message = {
        id: `msg-${++idCounter.current}`,
        role: 'assistant',
        content: outputRef.current,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, assistantMessage]);
      outputRef.current = '';
      setCurrentOutput('');
    }
    setIsStreaming(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    outputRef.current = '';
    setCurrentOutput('');
  }, []);

  return {
    messages,
    currentOutput,
    isStreaming,
    sendMessage,
    finalizeResponse,
    clearMessages
  };
}
