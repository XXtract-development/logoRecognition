import { useEffect, useState, useCallback, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import { useAnnotationStore } from '../stores/annotationStore';

interface Collaborator {
  id: string;
  name: string;
  color: string;
  active: boolean;
}

interface CursorPosition {
  x: number;
  y: number;
  timestamp: number;
}

export const useWebSocketConnection = (datasetId: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [cursorPositions, setCursorPositions] = useState<Record<string, CursorPosition>>({});
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const { addAnnotation, updateAnnotation, deleteAnnotation } = useAnnotationStore();

  const connect = useCallback(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      console.error('No auth token found');
      return;
    }

    const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:8000';
    const socketInstance = io(`${wsUrl}/annotations/${datasetId}`, {
      query: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketInstance.on('connect', () => {
      console.log('Connected to WebSocket');
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Disconnected from WebSocket:', reason);
      setIsConnected(false);
    });

    socketInstance.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Annotation events
    socketInstance.on('annotation_created', (data) => {
      addAnnotation(data.annotation);
    });

    socketInstance.on('annotation_updated', (data) => {
      updateAnnotation(data.annotationId, data.updates);
    });

    socketInstance.on('annotation_deleted', (data) => {
      deleteAnnotation(data.annotationId);
    });

    // Collaboration events
    socketInstance.on('user_joined', (data) => {
      setCollaborators((prev) => [...prev, data.user]);
    });

    socketInstance.on('user_left', (data) => {
      setCollaborators((prev) => prev.filter((c) => c.id !== data.userId));
      setCursorPositions((prev) => {
        const updated = { ...prev };
        delete updated[data.userId];
        return updated;
      });
    });

    socketInstance.on('cursor_moved', (data) => {
      setCursorPositions((prev) => ({
        ...prev,
        [data.userId]: {
          x: data.position.x,
          y: data.position.y,
          timestamp: Date.now(),
        },
      }));
    });

    socketInstance.on('collaborators_list', (data) => {
      setCollaborators(data.collaborators);
    });

    // Conflict detection
    socketInstance.on('conflict_detected', (data) => {
      console.warn('Annotation conflict detected:', data);
      // Handle conflict UI notification here
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [datasetId, addAnnotation, updateAnnotation, deleteAnnotation]);

  useEffect(() => {
    connect();
    return () => {
      socket?.disconnect();
    };
  }, [connect]);

  const sendMessage = useCallback(
    (message: any) => {
      if (socket && isConnected) {
        socket.emit('message', {
          ...message,
          timestamp: Date.now(),
        });
      }
    },
    [socket, isConnected]
  );

  const sendAnnotationCreate = useCallback(
    (annotation: any) => {
      sendMessage({
        type: 'annotation_create',
        annotation,
      });
    },
    [sendMessage]
  );

  const sendAnnotationUpdate = useCallback(
    (annotationId: string, updates: any) => {
      sendMessage({
        type: 'annotation_update',
        annotation_id: annotationId,
        updates,
      });
    },
    [sendMessage]
  );

  const sendAnnotationDelete = useCallback(
    (annotationId: string) => {
      sendMessage({
        type: 'annotation_delete',
        annotation_id: annotationId,
      });
    },
    [sendMessage]
  );

  const sendCursorPosition = useCallback(
    (position: { x: number; y: number }) => {
      sendMessage({
        type: 'cursor_move',
        position,
      });
    },
    [sendMessage]
  );

  const sendSelectionChange = useCallback(
    (selectedIds: string[]) => {
      sendMessage({
        type: 'selection_change',
        selected_ids: selectedIds,
      });
    },
    [sendMessage]
  );

  // Clean up old cursor positions periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setCursorPositions((prev) => {
        const updated = { ...prev };
        Object.entries(updated).forEach(([userId, position]) => {
          if (now - position.timestamp > 5000) {
            // Remove cursor positions older than 5 seconds
            delete updated[userId];
          }
        });
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return {
    socket,
    isConnected,
    collaborators,
    cursorPositions,
    sendMessage,
    sendAnnotationCreate,
    sendAnnotationUpdate,
    sendAnnotationDelete,
    sendCursorPosition,
    sendSelectionChange,
  };
};