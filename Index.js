/* Archivo: index.js
 * Descripción: Bot de WhatsApp con modo automático y manual.
 *
 * Características:
 * - Menú interactivo de inicio.
 * - Modo automático para bienvenida a nuevos miembros.
 * - Modo manual para envío de mensajes a un solo contacto.
 * - Sin errores ni mensajes de depuración en la consola.
 */

import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import qrcode from 'qrcode-terminal';
import readline from 'readline';

// Configuración del logger para una salida limpia
const logger = pino({ level: 'info' }).child({ level: 'info' });

// --- LÓGICA DE PERSISTENCIA ---
const DB_FILE = path.resolve('./db.json');
const SESSION_PATH = 'baileys_auth';

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

async function connectToWhatsApp(mode) {
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
                connectToWhatsApp(mode);
            } else {
                logger.error('Máximo de reintentos de conexión alcanzado. Reinicia manualmente.');
            }
        } else if (connection === 'open') {
            reconnectAttempts = 0;
            logger.info('✅ Bot conectado y listo.');
            if (mode === 'manual') {
                await manualMode(sock);
            }
        }
    });

    // --- LÓGICA DE BIENVENIDA (SOLO PARA MODO AUTOMÁTICO) ---
    if (mode === 'automatic') {
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
    }
}

// --- FUNCIÓN DE BIENVENIDA ---
async function sendWelcomeMessage(jid, gid, sock) {
    const now = new Date();
    const fecha = now.toLocaleDateString('es-ES');
    const hora = now.toLocaleTimeString('es-ES');
    
    const text = `🌸✨ ¡Hola! Soy el Subbot ✨🌸\n\n📅 Fecha: ${fecha}\n⏰ Hora: ${hora}\n\nBienvenid@ al grupo. 🌟`;

    try {
        await sock.sendMessage(jid, { text });
        logger.info(`✅ Mensaje de bienvenida enviado a ${jid} en ${gid}.`);
    } catch (e) {
        logger.error(`❌ Error al enviar mensaje a ${jid}. Motivo: ${e.message}`);
    }
}

// --- MODO MANUAL ---
async function manualMode(sock) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const getManualInput = () => {
        return new Promise(resolve => {
            rl.question('\n📱 Ingresa el JID del destinatario (ej: 595XXXXXXXXXX@s.whatsapp.net o grupo@g.us):\n', (jid) => {
                rl.question('💬 Ingresa el mensaje que quieres enviar:\n', (message) => {
                    resolve({ jid, message });
                });
            });
        });
    };

    while (true) {
        const { jid, message } = await getManualInput();
        if (jid && message) {
            try {
                await sock.sendMessage(jid, { text: message });
                console.log(`\n✅ Mensaje enviado exitosamente a: ${jid}\n`);
            } catch (e) {
                console.log(`\n❌ Error al enviar el mensaje a ${jid}. Motivo: ${e.message}\n`);
            }
        } else {
            console.log('\nEntrada inválida. Por favor, ingresa el JID y el mensaje.\n');
        }
    }
}

// --- FUNCIÓN PRINCIPAL DE INICIO ---
async function startBot() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const getMode = () => {
        return new Promise(resolve => {
            console.log('Voy iniciando...');
            console.log('\nSelecciona un modo de operación:');
            console.log('1. Automático');
            console.log('2. Manual');
            rl.question('\nIngresa 1 o 2: ', (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    };

    const mode = await getMode();
    if (mode === '1') {
        console.log('\nModo automático seleccionado. El bot iniciará y funcionará solo.');
        connectToWhatsApp('automatic');
    } else if (mode === '2') {
        console.log('\nModo manual seleccionado. El bot esperará por tus instrucciones.');
        connectToWhatsApp('manual');
    } else {
        console.log('\nOpción inválida. El bot se detendrá. Por favor, reinicia y elige 1 o 2.');
    }
}

startBot();