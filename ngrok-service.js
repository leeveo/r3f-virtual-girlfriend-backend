import ngrok from 'ngrok'; import dotenv from 'dotenv'; import path from 'path'; import { fileURLToPath } from 'url';
// Ì†ΩÌ≥ç Localisation du fichier .env
const __filename = fileURLToPath(import.meta.url); const __dirname = path.dirname(__filename); dotenv.config({ path: path.join(__dirname, '.env') }); const port = process.env.PORT || 
3000; async function startNgrok() {
  try { const ngrokOptions = { addr: port, authtoken: process.env.NGROK_AUTH_TOKEN, cors_allowed_origins: [ "http://localhost:5173", "https://neemba-frontend.vercel.app", ], 
      configPath: null, // Ì†ΩÌ¥• Emp√™che ngrok de chercher un daemon local
    };
    if (process.env.NGROK_DOMAIN) { ngrokOptions.subdomain = process.env.NGROK_DOMAIN;
    }
    const url = await ngrok.connect(ngrokOptions); console.log(`Ì†ºÌºç Ngrok tunnel established at: ${url}`); console.log(`‚úÖ Your application is now accessible via this URL`);
    // Garde le tunnel actif jusqu'√† interruption
    process.on('SIGINT', async () => { console.log('Ì†ΩÌªë Shutting down ngrok...'); await ngrok.kill(); process.exit(0);
    });
  } catch (err) {
    console.error('‚ùå Ngrok tunnel failed:', err); console.log('Ì†ΩÌ≤° Make sure NGROK_AUTH_TOKEN is set in your .env file'); process.exit(1);
  }
}
startNgrok();
