// test.js
import fs from "fs";

const content = fs.readFileSync("rag_project/docs/example.txt", "utf8");

console.log("✅ Fichier lu :", content.substring(0, 300));
