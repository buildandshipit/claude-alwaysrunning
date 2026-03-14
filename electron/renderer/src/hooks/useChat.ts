import { useState, useEffect, useCallback, useRef } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ClaudeMessage {
  type: 'message';
  messageType: string;
  content?: string;
  isComplete?: boolean;
  data: any;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentOutput, setCurrentOutput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const outputRef = useRef('');
  const idCounter = useRef(0);

  useEffect(() => {
    // Listen for structured Claude messages (stream-json format)
    const unsubMessage = window.electronAPI.onClaudeMessage((msg: ClaudeMessage) => {
      // Only process messages with content
      if (msg.content) {
        outputRef.current = msg.content;
        setCurrentOutput(msg.content);
        setIsStreaming(true);
      }

      // If message is complete, finalize it
      if (msg.isComplete && msg.content) {
        const assistantMessage: Message = {
          id: `msg-${++idCounter.current}`,
          role: 'assistant',
          content: msg.content,
          timestamp: new Date()
        };
        setMessages((prev) => [...prev, assistantMessage]);
        outputRef.current = '';
        setCurrentOutput('');
        setIsStreaming(false);
      }
    });

    // Fallback: Listen for raw output (for non-JSON messages)
    const unsubOutput = window.electronAPI.onClaudeOutput((data: string) => {
      // Only use if we're not getting structured messages
      if (!outputRef.current) {
        outputRef.current += data;
        setCurrentOutput(outputRef.current);
        setIsStreaming(true);
      }
    });

    // Listen for history
    const unsubHistory = window.electronAPI.onHistory((data: string) => {
      if (data.trim()) {
        setCurrentOutput(data);
      }
    });

    // Request history on mount
    window.electronAPI.requestHistory(50);

    return () => {
      unsubMessage();
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
