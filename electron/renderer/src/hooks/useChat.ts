import { useState, useEffect, useCallback, useRef } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Strip ANSI escape codes from terminal output
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*\x07|\][^\x1B]*\x1B\\)/g, '');
}

// Clean terminal output for display
function cleanOutput(str: string): string {
  let cleaned = stripAnsi(str);
  // Remove common terminal control sequences
  cleaned = cleaned.replace(/\]\d;[^\x07\x1B]*(?:\x07|\x1B\\)/g, ''); // OSC sequences
  cleaned = cleaned.replace(/\[[\?0-9;]*[a-zA-Z]/g, ''); // CSI sequences
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // Control chars except \n \r \t
  return cleaned;
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
      // Accumulate streaming output, clean ANSI codes
      outputRef.current += cleanOutput(data);
      setCurrentOutput(outputRef.current);
      setIsStreaming(true);
    });

    // Listen for history
    const unsubHistory = window.electronAPI.onHistory((data: string) => {
      // Parse history into messages (simplified - just show as terminal output)
      if (data.trim()) {
        setCurrentOutput(cleanOutput(data));
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
