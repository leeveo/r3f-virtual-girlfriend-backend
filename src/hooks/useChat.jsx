import { createContext, useContext, useEffect, useState, useRef } from "react";

// ✅ Nettoyage de l'URL de backend
const rawBackendUrl = import.meta.env.VITE_API_URL || (
  window.location.hostname === "localhost"
    ? "http://localhost:8080"
    : "https://4cce-172-189-56-91.ngrok-free.app"
);
const backendUrl = rawBackendUrl.replace(/\/+$/, ""); // 🔧 Supprime les `/` finaux

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cameraZoomed, setCameraZoomed] = useState(true);
  
  // États pour la gestion de session
  const [sessionId, setSessionId] = useState(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState(null);
  const sessionCreated = useRef(false);

  // 🚀 Créer une session au chargement
  useEffect(() => {
    const createSession = async () => {
      if (sessionCreated.current) return;
      
      try {
        console.log('🚀 Creating new session...');
        const response = await fetch(`${backendUrl}/session/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}) // Session anonyme
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        setSessionId(data.sessionId);
        sessionCreated.current = true;
        setSessionError(null);
        console.log('✅ Session created:', data.sessionId);
      } catch (error) {
        console.error('❌ Failed to create session:', error);
        setSessionError(error.message);
        // Retry après 3 secondes
        setTimeout(createSession, 3000);
      } finally {
        setIsSessionLoading(false);
      }
    };

    createSession();
  }, []);

  // 🔚 Terminer la session quand l'utilisateur quitte
  useEffect(() => {
    const endSession = async () => {
      if (sessionId) {
        try {
          await fetch(`${backendUrl}/session/end`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessionId })
          });
          console.log('📝 Session ended on cleanup');
        } catch (error) {
          console.error('❌ Failed to end session:', error);
        }
      }
    };

    const handleBeforeUnload = () => {
      if (sessionId) {
        navigator.sendBeacon(`${backendUrl}/session/end`, 
          JSON.stringify({ sessionId }));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      endSession();
    };
  }, [sessionId]);

  // 🎯 Fonction de chat principale avec session
  const chat = async (message) => {
    if (!message || !sessionId) {
      console.warn('❌ Cannot send message: missing message or sessionId');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          message,
          sessionId 
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("❌ Backend error:", errText);
        return;
      }

      const resp = await res.json();
      const newMessages = resp?.messages || [];

      setMessages((prev) => [...prev, ...newMessages]);
    } catch (err) {
      console.error("❌ Network/chat error:", err);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Vérifie si le backend est joignable
  useEffect(() => {
    fetch(`${backendUrl}/`)
      .then((res) => {
        if (!res.ok) {
          console.error("🚨 Backend live mais renvoie erreur / !");
        }
      })
      .catch((err) => {
        console.error("❌ Connexion au backend échouée :", err);
      });
  }, []);

  return (
    <ChatContext.Provider
      value={{
        chat,
        message,
        loading,
        cameraZoomed,
        setCameraZoomed,
        sessionId,
        isSessionLoading,
        sessionError,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};