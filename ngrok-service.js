import ngrok from 'ngrok';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Localisation du fichier .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const port = process.env.PORT || 3000;

async function startNgrok() {
  try {
    const ngrokOptions = {
      addr: port,
      authtoken: process.env.NGROK_AUTH_TOKEN,
      // Retirer les options non supportées
      region: 'us' // ou 'eu', 'ap', 'au', 'sa', 'jp', 'in'
    };

    if (process.env.NGROK_DOMAIN) {
      ngrokOptions.subdomain = process.env.NGROK_DOMAIN;
    }

    console.log(`🚀 Starting ngrok tunnel on port ${port}...`);
    const url = await ngrok.connect(ngrokOptions);
    
    console.log(`🌐 Ngrok tunnel established at: ${url}`);
    console.log(`✅ Your application is now accessible via this URL`);
    console.log(`📋 Copy this URL: ${url}`);

    // Garde le tunnel actif jusqu'à interruption
    process.on('SIGINT', async () => {
      console.log('🔄 Shutting down ngrok...');
      await ngrok.kill();
      process.exit(0);
    });

    return url;
  } catch (err) {
    console.error('❌ Ngrok tunnel failed:', err);
    console.log('⚠️ Make sure NGROK_AUTH_TOKEN is set in your .env file');
    process.exit(1);
  }
}

startNgrok();
