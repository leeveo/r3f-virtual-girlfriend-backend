import { createContext, useContext, useEffect, useState } from "react";

// ✅ Nettoyage de l'URL de backend
const rawBackendUrl = import.meta.env.VITE_API_URL || (
  window.location.hostname === "localhost"
    ? "http://localhost:8080"
    : "https://0432d361a5af.ngrok-free.app"  // ⚠️ Utilisez la bonne URL ngrok
);
const backendUrl = rawBackendUrl.replace(/\/+$/, ""); // 🔧 Supprime les `/` finaux

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cameraZoomed, setCameraZoomed] = useState(true);
  const [sessionId, setSessionId] = useState(null);

  // 🚀 Créer une session (appelée lors de la première question)
  const createSession = async () => {
    try {
      console.log('🚀 Creating new session...');
      const response = await fetch(`${backendUrl}/session/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({}) // Session anonyme
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setSessionId(data.sessionId);
      console.log('✅ Session created:', data.sessionId);
      return data.sessionId;
    } catch (error) {
      console.error('❌ Failed to create session:', error);
      return null;
    }
  };

  // 🎯 Fonction de chat principale
  const chat = async (message) => {
    if (!message) return;

    setLoading(true);
    try {
      let currentSessionId = sessionId;
      
      // Créer une session si c'est la première question
      if (!currentSessionId) {
        currentSessionId = await createSession();
        if (!currentSessionId) {
          console.warn('⚠️ Cannot create session, continuing without session tracking');
        }
      }

      // Préparer le body de la requête
      const requestBody = { message };
      
      // ⚠️ N'ajouter sessionId que si la création a réussi
      if (currentSessionId && !currentSessionId.startsWith('temp-')) {
        requestBody.sessionId = currentSessionId;
      }

      const res = await fetch(`${backendUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify(requestBody),
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

  // 🟢 Marquer un message comme "joué"
  const onMessagePlayed = () => {
    setMessages((msgs) => msgs.slice(1));
  };

  // 🧠 Mise à jour du message actuel
  useEffect(() => {
    if (messages.length > 0) {
      setMessage(messages[messages.length - 1]);
    } else {
      setMessage(null);
    }
  }, [messages]);

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

  // 🔚 Nettoyer la session quand l'utilisateur quitte
  useEffect(() => {
    const endSession = async () => {
      if (sessionId) {
        try {
          await fetch(`${backendUrl}/session/end`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'ngrok-skip-browser-warning': 'true'
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

  return (
    <ChatContext.Provider
      value={{
        chat,
        message,
        onMessagePlayed,
        loading,
        cameraZoomed,
        setCameraZoomed,
        sessionId,
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
