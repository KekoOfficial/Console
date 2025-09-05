// index.js - MaestroSubbot (mejorado para Termux)
// Requisitos: Node >= 18
// npm install @whiskeysockets/baileys qrcode

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const fs = require('fs');
const readline = require('readline');
const url = require('url');

const AUTH_FOLDER = './auth_info';
const BROWSER = ['MaestroSubbot', 'Desktop', '1.0.0'];

// Estado en memoria
let owner = {};
let historial = { mensajes: [], media: [] };
let subbots = [];
let backups = [];

// Función para eliminar la carpeta de autenticación (¡nueva!)
function deleteAuthFolder() {
  if (fs.existsSync(AUTH_FOLDER)) {
    fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    console.log(`Carpeta de autenticación '${AUTH_FOLDER}' eliminada.`);
  }
}

// Util
function generarIdUnico(){ return 'owner_' + Math.random().toString(36).substr(2,9); }
function registrarOwner(ownerId, nombre){ owner = { id: ownerId, nombre, registrado: Date.now() }; console.log('Owner registrado:', owner); }
function cargarBackups(){ if(backups.length>0){ const last = backups[backups.length-1]; owner=last.owner; historial=last.historial; subbots=last.subbots; console.log('Backups restaurados.'); } else console.log('No hay backups previos.'); }
function guardarMensaje(m){ historial.mensajes.push(m); console.log('Mensaje guardado.'); }
function guardarMedia(a,c,t){ historial.media.push({ archivo:a, contacto:c, tipo:t, fecha: Date.now() }); console.log('Archivo multimedia guardado.'); }
function backupAutomatico(){ backups.push({ owner:{...owner}, historial:JSON.parse(JSON.stringify(historial)), subbots:[...subbots], fecha: Date.now() }); console.log('Backup automático realizado.'); }

// Comandos
function comandoC(){ console.log('Comando .c - Estado conexión Owner:', owner && owner.id ? 'Conectado' : 'No registrado'); }
function comandoCC(){ console.log('Comando .cc - Historial completo:', JSON.stringify(historial, null, 2)); }
function comandoP(){ console.log('Comando .p - Parámetros modificados (simulado).'); }
function comandoCerrar(sock){ console.log('Comando .cerrar - Cerrando conexión...'); if(sock && typeof sock.logout === 'function') sock.logout().catch(()=>{}); process.exit(0); }
function comandoLista(){ console.log('Comando .lista - Subbots conectados:', subbots); }

// Backoff para reconexión
let reconnectDelay = 1000;
function nextDelay(){ reconnectDelay = Math.min(60000, reconnectDelay * 1.8); return reconnectDelay; }
function resetDelay(){ reconnectDelay = 1000; }

// Inicia bot
async function startBot(){
  try{
    // *** MODIFICACIÓN: FORZAR ELIMINACIÓN DE CREDENCIALES AL INICIO ***
    deleteAuthFolder(); 
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion().catch(()=>({ version: [2,3000,0] }));
    console.log('Baileys version:', version);

    // Opcional: configurar proxy vía env WA_PROXY (ej: http://127.0.0.1:8888)
    const connectOptions = {};
    if (process.env.WA_PROXY) {
      console.log('Usando proxy WA_PROXY=', process.env.WA_PROXY);
      connectOptions.fetchAgent = undefined; // si necesitas un agent custom, configúralo aquí
    }

    const sock = makeWASocket({
      version,
      auth: state,
      browser: BROWSER,
      getMessage: async key => ({ conversation: '' }),
      ...connectOptions
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Mostrar QR ASCII para escanear
        qrcode.toString(qr, { type: 'terminal' }, (err, out) => {
          if(err){ console.error('Error generando QR ascii:', err); console.log('QR string:', qr); return; }
          console.log('\n---- ESCANEA ESTE QR EN WHATSAPP > Dispositivos vinculados > Vincular un dispositivo ----\n');
          console.log(out);
          console.log('\nSi no puedes ver el QR aquí, copia el string a un editor:\n', qr, '\n');
        });
      }

      if (connection === 'open'){
        console.log('Conectado a WhatsApp Web ✅');
        resetDelay();
        try {
          const userId = sock.user && (sock.user.id || sock.user.jid) ? (sock.user.id || sock.user.jid) : generarIdUnico();
          registrarOwner(userId, (owner.nombre || 'Keko'));
          backupAutomatico();
        } catch(e){ console.log('Error en registro owner:', e); }
      }

      if (connection === 'close'){
        const err = lastDisconnect?.error;
        console.log('Conexión cerrada. lastDisconnect:', JSON.stringify(lastDisconnect?.error?.output || lastDisconnect?.error || lastDisconnect, null, 2));
        // Si fue loggedOut => eliminar credenciales para forzar QR nuevo (solo si el usuario quiere)
        const code = lastDisconnect?.error?.output?.statusCode;
        if(code === DisconnectReason.loggedOut){
          console.log('Sesión cerrada (loggedOut). Borra la carpeta', AUTH_FOLDER, 'si quieres regenerar QR.');
        } else {
          const delay = nextDelay();
          console.log(`Reconectando en ${Math.round(delay/1000)}s (backoff) ...`);
          setTimeout(()=> startBot().catch(e => console.error('Error al reconectar:', e)), delay);
        }
      }
    });

    // Mensajes entrantes
    sock.ev.on('messages.upsert', m => {
      try {
        const messages = m.messages || [];
        messages.forEach(msg => {
          if (!msg.message || msg.key && msg.key.fromMe) return;
          const from = msg.key.remoteJid || 'unknown';
          let text = '';
          if (msg.message.conversation) text = msg.message.conversation;
          else if (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) text = msg.message.extendedTextMessage.text;
          guardarMensaje({ de: from, texto: text, fecha: Date.now() });
          console.log('Mensaje recibido de', from, ':', text);
        });
      } catch(e){ console.error('messages.upsert error:', e); }
    });

    startConsoleInterface(sock);

  } catch(err){
    console.error('Error inicializando bot:', err);
    const delay = nextDelay();
    console.log(`Reintentando start en ${Math.round(delay/1000)}s ...`);
    setTimeout(()=> startBot().catch(e=>console.error('Error al reintentar start:', e)), delay);
  }
}

function startConsoleInterface(sock){
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  console.log('\nInterfaz en consola lista. Comandos: .c .cc .p .cerrar .lista .backup .restore .qr .help\n');
  rl.prompt();

  rl.on('line', async (line) => {
    const cmd = line.trim();
    if (cmd === '.c') comandoC();
    else if (cmd === '.cc') comandoCC();
    else if (cmd === '.p') comandoP();
    else if (cmd === '.lista') comandoLista();
    else if (cmd === '.backup') backupAutomatico();
    else if (cmd === '.restore' || cmd === '.cargar') cargarBackups();
    else if (cmd === '.qr') {
      const id = generarIdUnico();
      qrcode.toString(id, { type: 'terminal' }, (err, url) => { if (err) return console.error('Error gen qr local:', err); console.log('QR (local) para id:', id); console.log(url); });
    }
    else if (cmd === '.cerrar') comandoCerrar(sock);
    else if (cmd === '.help') console.log('Comandos: .c .cc .p .cerrar .lista .backup .restore .qr .help .exit');
    else if (cmd === '.exit') { rl.close(); process.exit(0); }
    else console.log('Comando no reconocido. Escribe .help');
    rl.prompt();
  });

  rl.on('close', () => console.log('Interfaz cerrada.'));
}

startBot();
