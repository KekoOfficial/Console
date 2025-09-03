import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } from '@whiskeysockets/baileys'; import pino from 'pino'; import qrcode from 'qrcode-terminal'; import fs from 'fs'; import path from 'path';

const logger = pino({ level: 'info' }); const DB_FILE = path.join('./', 'db.json');

// Cargar base de datos o crear nueva function loadDB() { if(!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ privateSent: [] }, null, 2)); return JSON.parse(fs.readFileSync(DB_FILE,'utf8')); } function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } let db = loadDB();

// Formato de fecha y hora con milisegundos function getTimestamp() { const now = new Date(); const fecha = now.toLocaleDateString(); const hora = now.toTimeString().split(' ')[0] + '.' + now.getMilliseconds(); return { fecha, hora }; }

// Función principal del bot async function startBot() { const { version } = await fetchLatestBaileysVersion(); logger.info('Baileys version:', version);

const sock = makeWASocket({ logger, printQRInTerminal: false });

// Mostrar QR en terminal sock.ev.on('connection.update', (update) => { const { connection, lastDisconnect, qr } = update; if(qr) { qrcode.generate(qr, { small: true }); console.log('Escanea el QR con tu WhatsApp'); } if(connection === 'close') { const reason = (lastDisconnect?.error)?.output?.statusCode || lastDisconnect?.error; logger.info('Conexión cerrada:', reason); if(lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut){ startBot(); } } if(connection === 'open') logger.info('✅ Bot conectado a WhatsApp'); });

// Comando .help en grupos sock.ev.on('messages.upsert', async (m) => { if(m.type !== 'notify') return; for(const msg of m.messages){ if(!msg.message) continue; const from = msg.key.remoteJid; const isGroup = from.endsWith('@g.us'); const content = msg.message.conversation || (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) || '';

if(isGroup && content.trim().toLowerCase() === '.help'){
    await sock.sendMessage(from, { text: '🌟 Soy Console Subbot 🌟\nComandos disponibles:\n.help - Mostrar ayuda' });
  }
}

});

// Detectar miembros automáticamente y enviar mensaje privado sock.ev.on('group-participants.update', async (update) => { const gid = update.id; const participants = update.participants; const action = update.action; const botJid = sock.user.id;

if(action === 'add'){
  if(participants.includes(botJid)){
    // Bot agregado, enviar mensaje a todos los miembros del grupo automáticamente
    const groupMetadata = await sock.groupMetadata(gid);
    for(const member of groupMetadata.participants.map(p => p.id)){
      if(member === botJid) continue;
      await sendPrivateMember(member, gid, sock);
    }
  } else {
    // Nuevos miembros se unieron, enviar mensaje si no recibido antes
    for(const p of participants){
      if(p === botJid) continue;
      await sendPrivateMember(p, gid, sock);
    }
  }
}

});

async function sendPrivateMember(jid, gid, sock) { jid = jidNormalizedUser(jid); if(!jid.includes('@')) jid += '@s.whatsapp.net'; if(db.privateSent.some(u => u.jid === jid)) return;

const { fecha, hora } = getTimestamp();
const text = `🌸✨ Hola, soy Console Bot ✨🌸\n\n📅 Fecha: ${fecha}\n⏰ Hora: ${hora}\n\nTe doy la bienvenida 🌟\nAhora puedes usar mis comandos con .help 🚀\n\n⚡️ Disfruta tu experiencia con el Subbot ⚡️`;

try {
  await sock.sendMessage(jid, { text });
  db.privateSent.push({ jid, grupo: gid, fecha, hora });
  saveDB(db);
  console.log(`✅ Mensaje enviado a ${jid}\n📅 Fecha: ${fecha}\n⏰ Hora: ${hora}\n💬 Grupo: ${gid}\n`);
} catch(e) {
  console.error('❌ Error enviando mensaje privado:', e);
}

}

logger.info('Console Subbot listo. Envíos automáticos activados para todos los miembros.'); }

startBot().catch(e => logger.error('Fallo al iniciar bot:', e));

