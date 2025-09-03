/* Archivo: index.js
Descripción: Bot "Subbot" para WhatsApp usando @whiskeysockets/baileys.
Versión mejorada y optimizada.

Funcionalidades:
- Conexión por QR (en el primer uso).
- Reconexión automática.
- Envío de un único mensaje de bienvenida a cada miembro que se une a un grupo.
- Registro de envíos en db.json para evitar duplicados.
- Comando .help en grupos para mostrar ayuda.
*/

import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';

// Configuración del logger para una salida limpia
const logger = pino({ level: 'info' }).child({ level: 'info' });

// Ruta del archivo de base de datos
const DB_FILE = path.join('./', 'db.json');

// Cargar la base de datos o crear una nueva si no existe
function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify({ welcomed: {} }, null, 2));
      logger.info('Archivo db.json creado.');
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    logger.error('Error al leer el archivo db.json:', e);
    return { welcomed: {} };
  }
}

// Guardar la base de datos en el archivo
function saveDB(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    logger.error('Error al guardar en el archivo db.json:', e);
  }
}

let db = loadDB();

// Función para obtener la fecha y hora actual
function getTimestamp() {
  const now = new Date();
  return {
    fecha: now.toLocaleDateString('es-ES'),
    hora: now.toLocaleTimeString('es-ES')
  };
}

// Lógica principal del bot
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`Usando Baileys versión: ${version}, ¿es la última? ${isLatest}`);

  const sock = makeWASocket({
    logger,
    printQRInTerminal: true, // Se recomienda mantenerlo así para el primer inicio
    auth: state
  });

  // Guardar credenciales de sesión automáticamente
  sock.ev.on('creds.update', saveCreds);

  // Manejar el estado de la conexión
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      qrcode.generate(qr, { small: true });
      logger.info('Por favor, escanea el código QR con tu teléfono para vincular el bot.');
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        logger.info('Sesión cerrada. Por favor, borra la carpeta "baileys_auth" y reinicia.');
      } else {
        logger.info('Conexión cerrada, reconectando...');
        startBot();
      }
    } else if (connection === 'open') {
      logger.info('✅ Bot conectado a WhatsApp.');
    }
  });

  // Manejar mensajes entrantes
  sock.ev.on('messages.upsert', async (m) => {
    try {
      if (m.type !== 'notify' || !m.messages[0]) return;
      const msg = m.messages[0];
      const from = msg.key.remoteJid;
      const isGroup = from.endsWith('@g.us');
      const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

      if (isGroup && messageText.trim().toLowerCase() === '.help') {
        const helpMessage = 'Soy un Subbot. Comandos disponibles:\n\n' +
                           '.help - Muestra esta ayuda.';
        await sock.sendMessage(from, { text: helpMessage });
        logger.info(`Comando .help usado en el grupo: ${from}`);
      }
    } catch (e) {
      logger.error('Error procesando el mensaje:', e);
    }
  });

  // Manejar eventos de participantes del grupo
  sock.ev.on('group-participants.update', async (update) => {
    const { id: gid, participants, action } = update;
    const botJid = jidNormalizedUser(sock.user.id);
    const groupData = db.welcomed[gid] || [];

    if (action === 'add') {
      for (const participant of participants) {
        const memberJid = jidNormalizedUser(participant);
        if (memberJid === botJid) {
          logger.info(`El bot se unió al grupo: ${gid}`);
        } else {
          // Si el miembro no ha sido saludado en este grupo
          if (!groupData.includes(memberJid)) {
            await sendWelcomeMessage(memberJid, gid, sock);
            groupData.push(memberJid);
            db.welcomed[gid] = groupData;
            saveDB(db);
          } else {
            logger.info(`El usuario ${memberJid} ya fue saludado en el grupo ${gid}.`);
          }
        }
      }
    }
  });
}

// Función para enviar el mensaje de bienvenida
async function sendWelcomeMessage(jid, gid, sock) {
  const { fecha, hora } = getTimestamp();
  const text = `🌸✨ ¡Hola! Soy el Subbot ✨🌸\n\n📅 Fecha: ${fecha}\n⏰ Hora: ${hora}\n\nBienvenid@ al grupo. 🌟\nUsa .help para ver mis comandos 🚀`;
  
  try {
    await sock.sendMessage(jid, { text });
    logger.info(`✅ Mensaje de bienvenida enviado a ${jid} en el grupo ${gid}.`);
  } catch (e) {
    logger.error(`❌ Error al enviar mensaje de bienvenida a ${jid}:`, e);
  }
}

// Iniciar el bot
startBot().catch(e => logger.error('Fallo al iniciar el bot:', e));