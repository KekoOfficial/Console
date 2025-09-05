// index.js
// MaestroSubbot - Todo en un solo archivo con Baileys (QR en terminal + sesión persistente)
// Requisitos: Node >= 18
// Instalar: npm install @whiskeysockets/baileys qrcode

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode'); // solo usado si quieres generar QR alternativo
const fs = require('fs');
const readline = require('readline');

// ----------------- Config -----------------
const AUTH_FOLDER = './auth_info'; // carpeta donde Baileys guardará credenciales (useMultiFileAuthState crea varios archivos aquí)
const BROWSER = ['MaestroSubbot', 'Desktop', '1.0.0'];

// ----------------- Estado en memoria -----------------
let owner = {};
let historial = { mensajes: [], media: [] };
let subbots = [];
let backups = [];

// ----------------- Utilidades -----------------
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
    owner = last.owner;
    historial = last.historial;
    subbots = last.subbots;
    console.log('Backups restaurados.');
  } else {
    console.log('No hay backups previos.');
  }
}

function guardarMensaje(mensaje) {
  historial.mensajes.push(mensaje);
  console.log('Mensaje guardado.');
}

function guardarMedia(archivo, contacto, tipo) {
  historial.media.push({ archivo, contacto, tipo, fecha: Date.now() });
  console.log('Archivo multimedia guardado.');
}

function backupAutomatico() {
  backups.push({
    owner: { ...owner },
    historial: JSON.parse(JSON.stringify(historial)),
    subbots: [...subbots],
    fecha: Date.now()
  });
  console.log('Backup automático realizado.');
}

// Comandos
function comandoC() {
  console.log('Comando .c - Estado conexión Owner:', owner && owner.id ? 'Conectado' : 'No registrado');
}
function comandoCC() {
  console.log('Comando .cc - Historial completo:', JSON.stringify(historial, null, 2));
}
function comandoP() {
  console.log('Comando .p - Parámetros modificados (simulado).');
}
function comandoCerrar(sock) {
  console.log('Comando .cerrar - Cerrando conexión...');
  if (sock && typeof sock.logout === 'function') {
    sock.logout().catch(()=>{});
  }
  process.exit(0);
}
function comandoLista() {
  console.log('Comando .lista - Subbots conectados:', subbots);
}

// ----------------- Baileys integration -----------------
async function startBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion().catch(()=>({ version: [2, 2200, 0] }));
    console.log('Baileys version to use:', version);

    const sock = makeWASocket({
      version,
      printQRInTerminal: true, // imprime QR automáticamente en terminal
      auth: state,
      browser: BROWSER,
      getMessage: async key => { return { conversation: '' } } // simple placeholder
    });

    // guardar credenciales cuando se actualicen
    sock.ev.on('creds.update', saveCreds);

    // manejar eventos de conexión
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Baileys ya imprime el QR (printQRInTerminal). También mostramos el string por si quieres copiarlo.
        console.log('QR recibido (string):', qr);
        // Si quieres, también puedes usar qrcode para generar una imagen o representarlo:
        // qrcode.toString(qr, { type: 'terminal' }, (err, url) => { if (!err) console.log(url) });
      }

      if (connection === 'open') {
        console.log('Conectado a WhatsApp Web ✅');
        // registrar owner con datos del socket si no está registrado
        try {
          // sock.user puede variar según la versión; intentamos obtener id
          const userId = sock.user && (sock.user.id || sock.user.jid || sock.user.wa_version) ? (sock.user.id || sock.user.jid) : generarIdUnico();
          registrarOwner(userId, (owner.nombre || 'Keko'));
          // ejecutamos algunas pruebas / inicialización
          // ejemplo: crear backup inicial
          backupAutomatico();
        } catch (err) {
          console.log('Error registrando owner:', err);
        }
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        console.log('Conexión cerrada. Código:', code);
        if (code === DisconnectReason.loggedOut) {
          console.log('La sesión fue cerrada (logged out). Borra la carpeta auth_info para regenerar QR.');
          // opcional: eliminar auth folder para forzar nuevo inicio
          // fs.rmdirSync(AUTH_FOLDER, { recursive: true });
        } else {
          console.log('Intenta reconectar en 3s...');
          setTimeout(() => startBot().catch(e => console.error('Error al reconectar:', e)), 3000);
        }
      }
    });

    // ejemplo: manejar mensajes entrantes (puedes ampliar esto)
    sock.ev.on('messages.upsert', m => {
      try {
        const messages = m.messages || [];
        messages.forEach(msg => {
          // evita mensajes vacíos o propios
          if (!msg.message || msg.key && msg.key.fromMe) return;
          const from = msg.key.remoteJid || 'unknown';
          let text = '';
          if (msg.message.conversation) text = msg.message.conversation;
          else if (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) text = msg.message.extendedTextMessage.text;
          // guardar en historial
          guardarMensaje({ de: from, texto: text, fecha: Date.now() });
          console.log('Mensaje recibido de', from, ':', text);
        });
      } catch (err) {
        console.error('Error en messages.upsert:', err);
      }
    });

    // Exponer sock para control por consola
    startConsoleInterface(sock);

  } catch (err) {
    console.error('Error inicializando bot:', err);
  }
}

// ----------------- Console interface simple -----------------
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
      // Si la sesión no existe, Baileys normalmente imprimirá QR al iniciar.
      // Podemos generar un QR local con qrcode de un id temporal si lo deseas:
      const id = generarIdUnico();
      qrcode.toString(id, { type: 'terminal' }, (err, url) => {
        if (err) return console.error('Error generando qr local:', err);
        console.log('QR (local) para id:', id);
        console.log(url);
      });
    }
    else if (cmd === '.cerrar') {
      comandoCerrar(sock);
    }
    else if (cmd === '.help') {
      console.log('Comandos: .c .cc .p .cerrar .lista .backup .restore .qr .help .exit');
    }
    else if (cmd === '.exit') {
      rl.close();
      process.exit(0);
    } else {
      console.log('Comando no reconocido. Escribe .help');
    }
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('Interfaz cerrada.');
  });
}

// ----------------- Inicio -----------------
startBot();