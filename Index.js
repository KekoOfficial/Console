/* Archivo: index.js
 * Descripción: Bot "Subbot" para WhatsApp.
 * Versión optimizada con manejo de errores para evitar mensajes de consola innecesarios.
 *
 * Características clave:
 * - Conexión y Reconexión automática.
 * - Mensajes de bienvenida inteligentes y sin duplicados.
 * - Persistencia de datos atómica.
 * - Manejo de comandos en grupos.
 * - Manejo de errores para que la operación no se detenga.
 */

import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import qrcode from 'qrcode-terminal';

// --- CONFIGURACIÓN DEL SISTEMA Y REGISTRO (LOGGING) ---
const logger = pino({ level: 'info' }).child({ level: 'info' });
const DB_FILE = path.resolve('./db.json');
const SESSION_PATH = 'baileys_auth';

// --- LÓGICA DE PERSISTENCIA ATÓMICA ---
function loadDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify({ welcomed: {} }, null, 2));
            logger.info('db.json creado.');
        }
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        logger.error(`Error crítico: Fallo al cargar db.json. Motivo: ${e.message}`);
        process.exit(1);
    }
}

function saveDB(db) {
    try {
        const tempFile = `${DB_FILE}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(db, null, 2));
        fs.renameSync(tempFile, DB_FILE);
    } catch (e) {
        logger.error(`Error: Fallo al guardar en db.json. Motivo: ${e.message}`);
    }
}

let db = loadDB();

// --- LÓGICA DE CONEXIÓN Y RECONEXIÓN ---
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 5000;

async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        logger.info(`Usando Baileys v${version}, ¿es la última? ${isLatest}`);

        const sock = makeWASocket({
            logger,
            printQRInTerminal: true,
            auth: state,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('\nEscanea el QR para vincular. Esta es la única vez que lo verás.\n');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                const reason = (lastDisconnect.error)?.output?.statusCode;
                logger.warn(`Conexión cerrada. Razón: ${DisconnectReason[reason] || reason}`);

                if (reason === DisconnectReason.loggedOut) {
                    logger.info('Sesión cerrada. Borra la carpeta "baileys_auth" y reinicia.');
                } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    logger.info(`Reintentando conexión (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                    await new Promise(res => setTimeout(res, RECONNECT_DELAY_MS));
                    connectToWhatsApp();
                } else {
                    logger.error('Máximo de reintentos de conexión alcanzado. Reinicia manualmente.');
                }
            } else if (connection === 'open') {
                reconnectAttempts = 0;
                logger.info('✅ Bot conectado y listo. Operación automática activada.');
            }
        });

        // --- MANEJO DE EVENTOS Y COMANDOS ---
        sock.ev.on('messages.upsert', async (m) => {
            try {
                if (!m.messages[0]?.message) return;
                const msg = m.messages[0];
                const from = msg.key.remoteJid;
                const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

                if (from.endsWith('@g.us') && messageText.trim().toLowerCase() === '.help') {
                    const helpMessage = '🤖 Soy un Subbot.\n\nComandos disponibles:\n' +
                                       '.help - Muestra este mensaje.';
                    await sock.sendMessage(from, { text: helpMessage });
                    logger.info(`Comando .help usado en: ${from}`);
                }
            } catch (e) {
                logger.error(`Error al procesar mensaje. Motivo: ${e.message}`);
            }
        });

        sock.ev.on('group-participants.update', async (update) => {
            try {
                const { id: gid, participants, action } = update;
                const botJid = jidNormalizedUser(sock.user.id);

                if (action === 'add') {
                    for (const participant of participants) {
                        const memberJid = jidNormalizedUser(participant);
                        if (memberJid === botJid) {
                            logger.info(`El bot se unió al grupo: ${gid}.`);
                            continue;
                        }

                        if (!db.welcomed[gid]) {
                            db.welcomed[gid] = [];
                        }

                        if (!db.welcomed[gid].includes(memberJid)) {
                            await sendWelcomeMessage(memberJid, gid, sock);
                            db.welcomed[gid].push(memberJid);
                            saveDB(db);
                        } else {
                            logger.info(`Usuario ${memberJid} ya fue saludado en ${gid}.`);
                        }
                    }
                }
            } catch (e) {
                logger.error(`Error en actualización de participantes de grupo. Motivo: ${e.message}`);
            }
        });

    } catch (e) {
        logger.error(`ERROR FATAL: ${e.message}`);
        process.exit(1);
    }
}

// --- FUNCIÓN DE BIENVENIDA OPTIMIZADA ---
async function sendWelcomeMessage(jid, gid, sock) {
    const now = new Date();
    const fecha = now.toLocaleDateString('es-ES');
    const hora = now.toLocaleTimeString('es-ES');
    
    const text = `🌸✨ ¡Hola! Soy el Subbot ✨🌸\n\n📅 Fecha: ${fecha}\n⏰ Hora: ${hora}\n\nBienvenid@ al grupo. 🌟\nUsa .help para ver mis comandos 🚀`;

    try {
        await sock.sendMessage(jid, { text });
        logger.info(`✅ Mensaje de bienvenida enviado a ${jid} en ${gid}.`);
    } catch (e) {
        // Maneja el error sin mostrar la traza completa ni detener el bot.
        // Esto previene los mensajes repetidos que no quieres ver.
        logger.warn(`❌ No se pudo enviar el mensaje a ${jid}. Motivo: ${e.message}`);
    }
}

connectToWhatsApp();