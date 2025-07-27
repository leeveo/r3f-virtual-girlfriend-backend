import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";

let vectorStore = null;

export const getVectorStore = async () => {
  if (vectorStore) return vectorStore;

  const openAIApiKey = process.env.OPENAI_API_KEY;
  if (!openAIApiKey) {
    throw new Error("❌ Missing OPENAI_API_KEY in environment variable");
  }

  try {
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey,
    });

    console.log("✅ Vector store initialized successfully");

    vectorStore = await MemoryVectorStore.fromTexts([], [], embeddings);
    return vectorStore;
  } catch (error) {
    console.error("❌ Error initializing vector store:", error.message);
    throw new Error(`Failed to initialize vector store: ${error.message}`);
  }
};
