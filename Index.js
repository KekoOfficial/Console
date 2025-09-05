// index.js
// MaestroSubbot v2 - Baileys + QR terminal (manejo manual de connection.update)
// Requisitos: Node >= 18
// Instalar: npm install @whiskeysockets/baileys qrcode

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const fs = require('fs');
const readline = require('readline');

const AUTH_FOLDER = './auth_info';
const BROWSER = ['MaestroSubbot', 'Desktop', '1.0.0'];

let owner = {};
let historial = { mensajes: [], media: [] };
let subbots = [];
let backups = [];

function generarIdUnico() {
  return 'owner_' + Math.random().toString(36).substr(2, 9);
}
function registrarOwner(ownerId, nombre) {
  owner = { id: ownerId, nombre, registrado: Date.now() };
  console.log('Owner registrado:', owner);
}
function cargarBackups() {
  if (backups.length > 0) {
    const last = backups[backups.length - 1];
    owner = last.owner; historial = last.historial; subbots = last.subbots;
    console.log('Backups restaurados.');
  } else console.log('No hay backups previos.');
}
function guardarMensaje(mensaje) { historial.mensajes.push(mensaje); console.log('Mensaje guardado.'); }
function guardarMedia(archivo, contacto, tipo) { historial.media.push({ archivo, contacto, tipo, fecha: Date.now() }); console.log('Archivo multimedia guardado.'); }
function backupAutomatico() {
  backups.push({ owner: { ...owner }, historial: JSON.parse(JSON.stringify(historial)), subbots: [...subbots], fecha: Date.now() });
  console.log('Backup automático realizado.');
}
function comandoC() { console.log('Comando .c - Estado conexión Owner:', owner && owner.id ? 'Conectado' : 'No registrado'); }
function comandoCC() { console.log('Comando .cc - Historial completo:', JSON.stringify(historial, null, 2)); }
function comandoP() { console.log('Comando .p - Parámetros modificados (simulado).'); }
function comandoCerrar(sock) { console.log('Comando .cerrar - Cerrando conexión...'); if (sock && typeof sock.logout === 'function') sock.logout().catch(()=>{}); process.exit(0); }
function comandoLista() { console.log('Comando .lista - Subbots conectados:', subbots); }

async function startBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion().catch(()=>({ version: [2, 3000, 0] }));
    console.log('Baileys version to use:', version);

    const sock = makeWASocket({
      version,
      auth: state,
      browser: BROWSER,
      getMessage: async key => ({ conversation: '' })
    });

    sock.ev.on('creds.update', saveCreds);

    // connection.update: manejamos QR aquí
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Generar QR ASCII en terminal para escanear con WhatsApp > Dispositivos vinculados > Vincular un dispositivo
        qrcode.toString(qr, { type: 'terminal' }, (err, url) => {
          if (err) {
            console.error('Error generando QR en terminal:', err);
            console.log('QR string (por si acaso):', qr);
            return;
          }
          console.log('\n---- ESCANEA ESTE QR CON WHATSAPP ----\n');
          console.log(url);
          console.log('\nSi no puedes ver el QR, copia este string y úsalo donde necesites:\n', qr, '\n');
        });
      }

      if (connection === 'open') {
        console.log('Conectado a WhatsApp Web ✅');
        try {
          const userId = sock.user && (sock.user.id || sock.user.jid) ? (sock.user.id || sock.user.jid) : generarIdUnico();
          registrarOwner(userId, (owner.nombre || 'Keko'));
          backupAutomatico();
        } catch (err) { console.log('Error registrando owner:', err); }
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        console.log('Conexión cerrada. Código:', code);
        if (code === DisconnectReason.loggedOut) {
          console.log('Sesión cerrada (loggedOut). Borra', AUTH_FOLDER, 'para regenerar QR.');
        } else {
          console.log('Reconectando en 3s...');
          setTimeout(() => startBot().catch(e => console.error('Error al reconectar:', e)), 3000);
        }
      }
    });

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
      } catch (err) { console.error('Error en messages.upsert:', err); }
    });

    startConsoleInterface(sock);

  } catch (err) {
    console.error('Error inicializando bot:', err);
  }
}

function startConsoleInterface(sock) {
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
      // Genera un QR local (no es el de WhatsApp) — útil para pruebas
      const id = generarIdUnico();
      qrcode.toString(id, { type: 'terminal' }, (err, url) => {
        if (err) return console.error('Error generando qr local:', err);
        console.log('QR (local) para id:', id);
        console.log(url);
      });
    }
    else if (cmd === '.cerrar') comandoCerrar(sock);
    else if (cmd === '.help') console.log('Comandos: .c .cc .p .cerrar .lista .backup .restore .qr .help .exit');
    else if (cmd === '.exit') { rl.close(); process.exit(0); }
    else console.log('Comando no reconocido. Escribe .help');
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('Interfaz cerrada. Si quieres mantener el bot en background usa pm2 o nohup.');
  });
}

startBot();