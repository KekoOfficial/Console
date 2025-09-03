/* Archivo: index.js
Descripción: Bot "Subbot" para WhatsApp usando @whiskeysockets/baileys.
Incluye:
- Conexión persistente.
- Envío de mensajes privados a nuevos miembros del grupo.
- Logs en db.json para evitar reenvíos tras reinicios.
- Comando .help en grupos.
*/

import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';

const logger = pino({ level: 'info' });
const DB_FILE = path.join('./', 'db.json');

// Cargar base de datos o crear una nueva
function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ privateSent: [] }, null, 2));
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    logger.error('Error al leer la DB:', e);
    return { privateSent: [] };
  }
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    logger.error('Error al guardar la DB:', e);
  }
}

let db = loadDB();

// Formato de fecha y hora con milisegundos
function getTimestamp() {
  const now = new Date();
  const fecha = now.toLocaleDateString();
  const hora = now.toTimeString().split(' ')[0] + '.' + now.getMilliseconds();
  return { fecha, hora };
}

// Función principal del bot
async function startBot() {
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info('Baileys version:', version, 'isLatest?', isLatest);

  const sock = makeWASocket({
    logger,
    printQRInTerminal: true // Mantener para el primer uso. Luego, se puede cambiar a 'false'.
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      qrcode.generate(qr, { small: true });
      console.log('Escanea el QR con tu WhatsApp para vincular.');
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error)?.output?.statusCode || lastDisconnect?.error;
      logger.info('Conexión cerrada:', reason);
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        startBot();
      } else {
        logger.info('Se desconectó (loggedOut). Borra el archivo "auth_info_baileys" y reinicia para escanear de nuevo.');
      }
    }

    if (connection === 'open') {
      logger.info('✅ Bot conectado a WhatsApp.');
    }
  });

  // Mensajes entrantes y comandos
  sock.ev.on('messages.upsert', async (m) => {
    try {
      if (m.type !== 'notify') return;
      for (const msg of m.messages) {
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const messageContent = msg.message.conversation || (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) || '';

        // Responder .help en grupos
        if (isGroup && messageContent.trim().toLowerCase() === '.help') {
          await sock.sendMessage(from, { text: 'Soy un Subbot. Comandos disponibles:\n.help - Mostrar ayuda' });
          logger.info(`Comando .help usado en el grupo: ${from}`);
        }
      }
    } catch (e) {
      logger.error('Error en messages.upsert:', e);
    }
  });

  // Eventos de participantes del grupo: join/added/leave
  sock.ev.on('group-participants.update', async (update) => {
    try {
      const gid = update.id;
      const participants = update.participants;
      const action = update.action;
      const botJid = jidNormalizedUser(sock.user.id);
      
      for (const p of participants) {
        const welcomedJid = jidNormalizedUser(p);

        if (welcomedJid === botJid) {
          logger.info(`Bot añadido al grupo: ${gid}.`);
        }
        
        // Si el bot no es el que se une y la acción es 'add', envía el mensaje de bienvenida.
        if (welcomedJid !== botJid && action === 'add') {
            await sendPrivateMember(welcomedJid, gid, sock);
        }
      }
    } catch (e) {
      logger.error('Error en group-participants.update:', e);
    }
  });
}

// Envía un mensaje privado a un miembro del grupo
async function sendPrivateMember(jid, gid, sock) {
  if (db.privateSent.some(u => u.jid === jid)) {
    logger.info(`Ya se envió un mensaje a ${jid}. No se reenvía.`);
    return;
  }

  const { fecha, hora } = getTimestamp();
  const text = `🌸✨ ¡Hola! Soy el Console Bot. ✨🌸\n\n📅 Fecha: ${fecha}\n⏰ Hora: ${hora}\n\nTe doy la bienvenida al grupo. 🌟\nAhora puedes usar mis comandos con .help 🚀\n\n⚡️ ¡Disfruta tu experiencia con el Subbot! ⚡️`;

  try {
    await sock.sendMessage(jid, { text });
    db.privateSent.push({ jid, grupo: gid, fecha, hora });
    saveDB(db);
    logger.info(`✅ Mensaje enviado a ${jid} | Fecha: ${fecha} | Hora: ${hora} | Grupo: ${gid}`);
  } catch (e) {
    logger.error(`❌ Error enviando mensaje privado a ${jid}:`, e);
  }
}

startBot().catch(e => logger.error('Fallo al iniciar el bot:', e));