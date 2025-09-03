/* Archivo: index.js Descripción: Bot "Subbot" para WhatsApp usando @whiskeysockets/baileys. Incluye:

Conexión por QR (imprime QR en consola)

Envío de mensajes privados 1 vez por número (persistente)

Logs en db.json para evitar reenvíos tras reinicios

Mensaje automático al unirse el bot al grupo

Mensaje automático cuando entra un nuevo miembro al grupo (persistente)

Comando .help en grupos


INSTRUCCIONES RÁPIDAS (también incluidas aquí):

1. Tener Node.js 18+ instalado.


2. Crear carpeta del proyecto y poner este archivo como index.js.


3. Crear package.json con "type":"module" o usar Node ESM. (abajo hay un ejemplo de package.json)


4. Instalar dependencias: npm install @whiskeysockets/baileys qrcode-terminal pino


5. Ejecutar: node index.js



EJEMPLO package.json mínimo: { "name": "whatsapp-subbot", "version": "1.0.0", "type": "module", "main": "index.js", "scripts": { "start": "node index.js" }, "dependencies": { "@whiskeysockets/baileys": "^6.0.0", "qrcode-terminal": "^0.12.0", "pino": "^8.0.0" } }

NOTAS DE SEGURIDAD Y ÉTICA:

Usa este bot sólo con consentimiento y en cumplimiento de las políticas de WhatsApp.

No lo uses para spam o para enviar mensajes masivos sin permiso.


*/

import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, generateForwardMessageContent, makeCacheStore, jidNormalizedUser, proto } from '@whiskeysockets/baileys' import pino from 'pino' import qrcode from 'qrcode-terminal' import fs from 'fs' import path from 'path'

const logger = pino({ level: 'info' })

const DB_FILE = path.join('./', 'db.json')

function loadDB(){ try{ if(!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ privateSent: [], groupAnnounced: [], groupMemberWelcomed: {} }, null, 2)) return JSON.parse(fs.readFileSync(DB_FILE,'utf8')) }catch(e){ logger.error('Error al leer DB:', e) return { privateSent: [], groupAnnounced: [], groupMemberWelcomed: {} } } }

function saveDB(db){ try{ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)) }catch(e){ logger.error('Error al guardar DB:', e) } }

let db = loadDB()

async function startBot(){ const { version, isLatest } = await fetchLatestBaileysVersion() logger.info('Baileys version:', version, 'isLatest?', isLatest)

const sock = makeWASocket({ logger, printQRInTerminal: false })

// Mostrar QR en consola cuando se emita sock.ev.on('connection.update', (update) => { const { connection, lastDisconnect, qr } = update if(qr){ qrcode.generate(qr, { small: true }) console.log('\nEscanea el QR con tu WhatsApp para vincular (usa tu teléfono)') }

if(connection === 'close'){
  const reason = (lastDisconnect?.error)?.output?.statusCode || lastDisconnect?.error
  logger.info('Conexión cerrada:', reason)
  // reconectar automáticamente
  if(lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut){
    startBot()
  } else {
    logger.info('Se desconectó (loggedOut). Borra credenciales y vuelve a escanear si lo deseas.')
  }
}

if(connection === 'open'){
  logger.info('Sesión conectada')
}

})

// Guardar credenciales de auth automaticamente (baileys lo hace internamente si usas state) // Mensajes entrantes y comandos sock.ev.on('messages.upsert', async (m) => { try{ if(m.type !== 'notify') return for(const msg of m.messages){ if(!msg.message) continue if(msg.key && msg.key.remoteJid === 'status@broadcast') continue const from = msg.key.remoteJid const isGroup = from.endsWith('@g.us') const messageContent = msg.message.conversation || (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) || ''

// Responder .help en grupos
    if(isGroup && messageContent.trim().toLowerCase() === '.help'){
      await sock.sendMessage(from, { text: 'Soy un Subbot. Comandos disponibles:\n.help - Mostrar ayuda' })
    }

    // Aquí podrías añadir manejo de más comandos si lo deseas
  }
}catch(e){
  logger.error('Error en messages.upsert:', e)
}

})

// Eventos de participantes del grupo: join/added/leave sock.ev.on('group-participants.update', async (update) => { try{ const gid = update.id const participants = update.participants // array de jids const action = update.action // 'add' | 'remove' | 'promote' | 'demote'

// Si el bot fue añadido al grupo
  if(action === 'add'){
    // Si el bot está entre los añadidos -> anuncio automático en el grupo
    const botJid = sock.user.id
    if(participants.includes(botJid)){
      // anunciar en el grupo si no se hizo antes
      if(!db.groupAnnounced.includes(gid)){
        const text = 'Hola 👋, hay un Subbot en este grupo. Pueden usar mis comandos con .help'
        await sock.sendMessage(gid, { text })
        db.groupAnnounced.push(gid)
        saveDB(db)
      } else {
        logger.info('Ya se había anunciado este grupo:', gid)
      }
      return
    }

    // Si otros usuarios fueron añadidos, damos mensaje de bienvenida a esos usuarios (pero solo una vez por usuario en ese grupo)
    for(const p of participants){
      // Ignorar si el añadido es el bot
      if(p === sock.user.id) continue
      const welcomed = db.groupMemberWelcomed[gid] || []
      if(!welcomed.includes(p)){
        const text = `Bienvenid@! 👋 Hay un Subbot en este grupo. Usa .help para ver comandos.`
        await sock.sendMessage(gid, { text, mentions: [p] })
        // registrar
        db.groupMemberWelcomed[gid] = [...welcomed, p]
        saveDB(db)
      } else {
        logger.info('Usuario ya bienvenido en este grupo:', p, gid)
      }
    }
  }

  // También podríamos manejar action === 'remove' si queremos borrar logs cuando alguien se va

}catch(e){
  logger.error('Error en group-participants.update:', e)
}

})

// FUNCIONES PÚBLICAS ÚTILES: enviar mensaje privado 1 vez async function sendPrivateOnce(jid, text){ try{ // normalizar jid (por si el usuario pasó sólo números) jid = jidNormalizedUser(jid) // asegúrate que termine con @s.whatsapp.net if(!jid.includes('@')) jid = jid + '@s.whatsapp.net'

if(db.privateSent.includes(jid)){
    logger.info('Ya se envió antes a', jid)
    return { ok: false, reason: 'already_sent' }
  }

  await sock.sendMessage(jid, { text })
  db.privateSent.push(jid)
  saveDB(db)
  return { ok: true }
}catch(e){
  logger.error('Error al enviar privado:', e)
  return { ok: false, error: e }
}

}

// Exponer la función en objeto global simple por si quieres usarla desde REPL global.subbot = { sendPrivateOnce }

logger.info('Subbot listo. Usa global.subbot.sendPrivateOnce("595XXXXXXXX@s.whatsapp.net","Mensaje") desde REPL o añade lógica adicional en el código para enviar mensajes masivos (con consentimiento).')

}

startBot().catch(err => logger.error('Fallo al iniciar bot:', err))

