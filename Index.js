/* Archivo: index.js
 * Descripción: Bot "Subbot" para WhatsApp.
 * Versión optimizada, sin salida de consola.
 *
 * Características clave:
 * - Conexión y Reconexión automática.
 * - Mensajes de bienvenida inteligentes y sin duplicados.
 * - Persistencia de datos atómica.
 * - Manejo de comandos en grupos.
 */

import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import qrcode from 'qrcode-terminal';

// Configuración del logger, se desactiva la salida a la consola
const logger = pino({ level: 'silent' });

// --- LÓGICA DE PERSISTENCIA ATÓMICA ---
const DB_FILE = path.resolve('./db.json');
const SESSION_PATH = 'baileys_auth';

function loadDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify({ welcomed: {} }, null, 2));
        }
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        process.exit(1); 
    }
}

function saveDB(db) {
    try {
        const tempFile = `${DB_FILE}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(db, null, 2));
        fs.renameSync(tempFile, DB_FILE);
    } catch (e) {
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
        const sock = makeWASocket({
            logger,
            printQRInTerminal: true,
            auth: state,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                const reason = (lastDisconnect.error)?.output?.statusCode;
                if (reason === DisconnectReason.loggedOut) {
                } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    await new Promise(res => setTimeout(res, RECONNECT_DELAY_MS));
                    connectToWhatsApp();
                } else {
                }
            } else if (connection === 'open') {
                reconnectAttempts = 0;
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
                }
            } catch (e) {
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
                        }
                    }
                }
            } catch (e) {
            }
        });

    } catch (e) {
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
    } catch (e) {
    }
}

connectToWhatsApp();