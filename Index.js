const { makeWASocket, useMultiFileAuthState, DisconnectReason, jidNormalizedUser, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys')
const pino = require('pino')
const fs = require('fs')
const cron = require('node-cron')
const qrcode = require('qrcode-terminal')
const os = require('os')
const chalk = require('chalk')

// === Configuración del Bot (Valores fijos) ===
// ¡IMPORTANTE! Reemplaza 'TU_NUMERO_DE_TELEFONO_AQUI@s.whatsapp.net' con tu número de teléfono real.
// Ejemplo: '595984495031@s.whatsapp.net'
const CREATOR_JID = "TU_NUMERO_DE_TELEFONO_AQUI@s.whatsapp.net";
const OFFENSIVE_WORDS = [
    "puto",
    "puta",
    "mierda",
    "imbecil",
    "estúpido"
];
const botVersion = "1.0.0";

let groupCommandsEnabled = true
let isAntiLinkEnabled = true
let isWordFilterEnabled = true
let botMode = 'activo'

// === Variables y Funciones para el Manejo de Bienvenida y Puntos ===
const SENT_FILE = './sentUsers.json';
let sentUsers = [];
const USER_DATA_FILE = './user_data.json';
let userData = {};

// Asegura que las carpetas existan
if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs')
}
if (!fs.existsSync('./session')) {
    fs.mkdirSync('./session')
}

// === Funciones de utilidad y persistencia ===

/**
 * Carga los registros de usuarios contactados desde el archivo de persistencia.
 */
function loadSentRecords() {
    try {
        if (fs.existsSync(SENT_FILE)) {
            sentUsers = JSON.parse(fs.readFileSync(SENT_FILE, 'utf-8'));
            console.log(chalk.green(`✅ Registros de bienvenida cargados: ${sentUsers.length} usuarios ya contactados.`));
        } else {
            console.log(chalk.yellow('⚠️ No se encontraron registros de bienvenida. Se creará un nuevo archivo.'));
        }
    } catch (err) {
        console.error(chalk.red(`❌ Error al leer el archivo de registros de bienvenida: ${err.message}`));
    }
}

/**
 * Guarda los registros de usuarios contactados en el archivo de persistencia.
 */
function saveSentRecords() {
    try {
        fs.writeFileSync(SENT_FILE, JSON.stringify(sentUsers, null, 2));
    } catch (err) {
        console.error(chalk.red(`❌ Error al guardar los registros de bienvenida: ${err.message}`));
    }
}

/**
 * Carga los datos de los usuarios (puntos, etc.) desde el archivo de persistencia.
 */
function loadUserData() {
    try {
        if (fs.existsSync(USER_DATA_FILE)) {
            userData = JSON.parse(fs.readFileSync(USER_DATA_FILE, 'utf-8'));
            console.log(chalk.green(`✅ Datos de usuarios cargados: ${Object.keys(userData).length} usuarios registrados.`));
        } else {
            console.log(chalk.yellow('⚠️ No se encontraron datos de usuarios. Se creará un nuevo archivo.'));
            fs.writeFileSync(USER_DATA_FILE, JSON.stringify({}, null, 2));
        }
    } catch (err) {
        console.error(chalk.red(`❌ Error al leer el archivo de datos de usuarios: ${err.message}`));
    }
}

/**
 * Guarda los datos de los usuarios en el archivo de persistencia.
 */
function saveUserData() {
    try {
        fs.writeFileSync(USER_DATA_FILE, JSON.stringify(userData, null, 2));
    } catch (err) {
        console.error(chalk.red(`❌ Error al guardar los datos de usuarios: ${err.message}`));
    }
}

/**
 * Otorga puntos a un usuario y los guarda.
 * @param {string} jid El JID del usuario.
 */
function awardPoints(jid) {
    if (!userData[jid]) {
        userData[jid] = { points: 0 };
    }
    userData[jid].points += 1;
    saveUserData();
}

/**
 * Obtiene el rango de un usuario basado en sus puntos.
 * @param {number} points Los puntos del usuario.
 * @returns {string} El rango del usuario.
 */
function getRank(points) {
    if (points >= 2000) return '🏅 Leyenda del Grupo';
    if (points >= 1000) return '🏆 Veterano del Chat';
    if (points >= 500) return '🥇 Miembro Activo';
    if (points >= 100) return '🥈 Explorador';
    return '🥉 Novato';
}

const log = (message) => {
    console.log(chalk.green(`> ✅ Log: ${message}`));
};

const logError = (message) => {
    console.error(chalk.red(`> ❌ Error: ${message}`));
};

const logWarning = (message) => {
    console.log(chalk.yellow(`> ⚠️ Advertencia: ${message}`));
};

const appendLogFile = (filePath, content) => {
    try {
        fs.appendFileSync(filePath, content + '\n');
    } catch (e) {
        logError(`Error al escribir en el archivo de log: ${e.message}`);
    }
};

/**
 * Obtiene la fecha y hora actual en formato local.
 * @returns {string} Fecha y hora formateada.
 */
function getFormattedDateTime() {
    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString('en-US', { hour12: false }) + `.${now.getMilliseconds()}`;
    return { date, time };
}

const handleGeneralCommands = async (sock, m, messageText) => {
    const senderJid = m.key.remoteJid;
    const command = messageText.toLowerCase().trim();
    const senderParticipant = m.key.participant || m.key.remoteJid;

    switch (true) {
        case command === '~menu':
        case command === '!ayuda':
        case command === '!help':
            const menuMessage = `
╔════════════════════╗
🌟 ⚙️ MENÚ DE COMANDOS 🌟
Creado por NoaDevStudio
╚════════════════════╝

✨ Comandos Generales:

📝 ~menu  —  Muestra este menú de comandos.
📊 !estado — Muestra el estado del bot y su versión.
🎲 !dado  — Lanza un dado.
🎱 !8ball — Haz una pregunta y recibe una respuesta.

🏆 Comandos de Puntos:

💯 !mis puntos — Ve tus puntos y rango actual.
🥇 !top10 — Muestra el ranking de los mejores 10.

💡 Para usar los comandos, solo escribe el comando en el chat.
`
            await sock.sendMessage(senderJid, { text: menuMessage });
            break;
        case command === '!estado':
            const uptime = process.uptime();
            const uptimeDays = Math.floor(uptime / (3600 * 24));
            const uptimeHours = Math.floor((uptime % (3600 * 24)) / 3600);
            const uptimeMinutes = Math.floor((uptime % 3600) / 60);
            const uptimeSeconds = Math.floor(uptime % 60);
            const freeMem = (os.freemem() / 1024 / 1024).toFixed(2);
            const totalMem = (os.totalmem() / 1024 / 1024).toFixed(2);
            const statusMessage = `*🤖 Estado del Bot:*\n\n✅ En línea\n⏰ Tiempo en línea: ${uptimeDays}d, ${uptimeHours}h, ${uptimeMinutes}m, ${uptimeSeconds}s\n🧠 Memoria Libre: ${freeMem} MB / ${totalMem} MB\n\nVersión: ${botVersion}\nModo actual: ${botMode.charAt(0).toUpperCase() + botMode.slice(1)}`;
            await sock.sendMessage(senderJid, { text: statusMessage });
            break;
        case command === '!dado':
            const roll = Math.floor(Math.random() * 6) + 1;
            await sock.sendMessage(senderJid, { text: `🎲 Has lanzado un dado y ha caído en: *${roll}*` });
            break;
        case command.startsWith('!8ball'):
            const responses = [
                "Sí, definitivamente.", "Es una certeza.", "Sin duda.", "Probablemente.",
                "No estoy seguro, pregúntame de nuevo.", "Mejor no te digo ahora.",
                "No cuentes con ello.", "Mi respuesta es no.", "Mis fuentes dicen que no."
            ];
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            await sock.sendMessage(senderJid, { text: `🎱 La bola mágica dice: *${randomResponse}*` });
            break;
        case command === '!mis puntos':
            const myPoints = userData[senderParticipant] ? userData[senderParticipant].points : 0;
            const myRank = getRank(myPoints);
            await sock.sendMessage(senderJid, { text: `💯 Tienes *${myPoints}* puntos.\nTu rango actual es: *${myRank}*` });
            break;
        case command === '!top10':
            const sortedUsers = Object.entries(userData).sort(([, a], [, b]) => b.points - a.points);
            let top10Message = `
🌟 *TOP 10 USUARIOS* 🌟
----------------------------
`;
            for (let i = 0; i < Math.min(10, sortedUsers.length); i++) {
                const [jid, data] = sortedUsers[i];
                const name = (await sock.getName(jid)) || `Usuario ${jid.split('@')[0]}`;
                top10Message += `${i + 1}. ${name}: *${data.points}* puntos\n`;
            }
            if (sortedUsers.length === 0) {
                top10Message += "No hay datos de puntos aún.";
            }
            await sock.sendMessage(senderJid, { text: top10Message });
            break;
        default:
            break;
    }
};

const handleCreatorCommands = async (sock, jid, messageText) => {
    const senderJid = jid;
    const isGroup = senderJid.endsWith('@g.us');
    const command = messageText.toLowerCase().trim();

    if (senderJid !== CREATOR_JID) {
        return false;
    }

    const mentionedJid = (messageText.match(/@(\d+)/)?.[1] || '') + '@s.whatsapp.net';

    switch (true) {
        case command === '.on':
            groupCommandsEnabled = true;
            await sock.sendMessage(senderJid, { text: '✅ Comandos de grupo activados.' });
            return true;
        case command === '.off':
            groupCommandsEnabled = false;
            await sock.sendMessage(senderJid, { text: '❌ Comandos de grupo desactivados.' });
            return true;
        case command.startsWith('.e '):
            const parts = messageText.split(' ');
            const targetNumber = parts[1].replace(/\D/g, '');
            const targetJid = `${targetNumber}@s.whatsapp.net`;
            const msgBody = parts.slice(2).join(' ');
            if (targetJid && msgBody) {
                try {
                    await sock.sendMessage(targetJid, { text: msgBody });
                    log(`Mensaje enviado a ${targetJid} desde el comando .e`);
                    await sock.sendMessage(senderJid, { text: `✅ Mensaje enviado a ${targetNumber}` });
                } catch (e) {
                    logError(`Error al enviar mensaje con .e: ${e.message}`);
                    await sock.sendMessage(senderJid, { text: `❌ No se pudo enviar el mensaje a ${targetNumber}.` });
                }
            } else {
                await sock.sendMessage(senderJid, { text: "Uso incorrecto del comando. Formato: .e número mensaje" });
            }
            return true;
        case command.startsWith('.modo '):
            const mode = command.split(' ')[1];
            if (['activo', 'silencioso', 'fiesta'].includes(mode)) {
                botMode = mode;
                await sock.sendMessage(senderJid, { text: `✅ Modo del bot cambiado a: *${mode.charAt(0).toUpperCase() + mode.slice(1)}*.` });
            } else {
                await sock.sendMessage(senderJid, { text: 'Uso incorrecto. Modos disponibles: `activo`, `silencioso`, `fiesta`.' });
            }
            return true;
        case command.startsWith('.filtro-palabras '):
            const filterStatus = command.split(' ')[1];
            if (filterStatus === 'on') {
                isWordFilterEnabled = true;
                await sock.sendMessage(senderJid, { text: '✅ Filtro de palabras activado.' });
            } else if (filterStatus === 'off') {
                isWordFilterEnabled = false;
                await sock.sendMessage(senderJid, { text: '❌ Filtro de palabras desactivado.' });
            } else {
                await sock.sendMessage(senderJid, { text: 'Uso incorrecto. Formato: `.filtro-palabras [on/off]`' });
            }
            return true;
        case command.startsWith('.bloquear-links '):
            const linkStatus = command.split(' ')[1];
            if (linkStatus === 'on') {
                isAntiLinkEnabled = true;
                await sock.sendMessage(senderJid, { text: '✅ Bloqueo de enlaces activado.' });
            } else if (linkStatus === 'off') {
                isAntiLinkEnabled = false;
                await sock.sendMessage(senderJid, { text: '❌ Bloqueo de enlaces desactivado.' });
            } else {
                await sock.sendMessage(senderJid, { text: 'Uso incorrecto. Formato: `.bloquear-links [on/off]`' });
            }
            return true;
        case isGroup && command.startsWith('.kick '):
            if (mentionedJid) {
                await sock.groupParticipantsUpdate(senderJid, [mentionedJid], 'remove');
                log(`Miembro ${mentionedJid} expulsado por el creador.`);
                await sock.sendMessage(senderJid, { text: `✅ Usuario expulsado.` });
            } else {
                await sock.sendMessage(senderJid, { text: "Uso incorrecto. Mencione a un usuario para expulsar." });
            }
            return true;
        case isGroup && command.startsWith('.promover '):
            if (mentionedJid) {
                await sock.groupParticipantsUpdate(senderJid, [mentionedJid], 'promote');
                log(`Miembro ${mentionedJid} promovido a admin.`);
                await sock.sendMessage(senderJid, { text: `✅ Usuario promovido a admin.` });
            } else {
                await sock.sendMessage(senderJid, { text: "Uso incorrecto. Mencione a un usuario para promover." });
            }
            return true;
        case isGroup && command.startsWith('.limpiar '):
            const numMessages = parseInt(command.split(' ')[1], 10);
            if (isNaN(numMessages) || numMessages <= 0) {
                await sock.sendMessage(senderJid, { text: "Uso incorrecto. Formato: `.limpiar [número de mensajes]`" });
                return true;
            }
            const messages = await sock.fetchMessages(senderJid, { count: numMessages });
            const messageKeys = messages.map(msg => msg.key);
            await sock.deleteMessages(senderJid, messageKeys);
            await sock.sendMessage(senderJid, { text: `✅ Se eliminaron los últimos ${numMessages} mensajes.` });
            return true;
        case command.startsWith('.anuncio '):
            const announcement = messageText.split(' ').slice(1).join(' ');
            const groups = await sock.groupFetchAllParticipating();
            for (const group of Object.values(groups)) {
                await sock.sendMessage(group.id, { text: `📢 *ANUNCIO DEL CREADOR:*\n\n${announcement}` });
            }
            await sock.sendMessage(senderJid, { text: `✅ Anuncio enviado a ${Object.keys(groups).length} grupos.` });
            return true;
        default:
            return false;
    }
};

/**
 * Envia un mensaje de bienvenida a un usuario específico y lo registra con persistencia.
 * @param {object} sock El objeto de socket de Baileys.
 * @param {string} user El JID del usuario.
 * @param {string} groupName El nombre del grupo.
 */
async function sendWelcomeMessageWithPersistence(sock, user, groupName) {
    const normalizedUser = jidNormalizedUser(user);
    if (!sentUsers.includes(normalizedUser)) {
        try {
            const { date, time } = getFormattedDateTime();
            const message = `
╔═══════════════════╗
║       🤖 SUBBOT       ║
╠═══════════════════╣
║ ¡Hola! Soy tu Subbot. ║
║ Puedes usar mis comandos: ║
║       .help           ║
╠═══════════════════╣
║ 👥 Grupo: ${groupName}
║ 📅 Fecha: ${date}
║ ⏰ Hora: ${time}
╚═══════════════════╝`;

            await sock.sendMessage(normalizedUser, { text: message });
            sentUsers.push(normalizedUser);
            saveSentRecords(); // Guarda el registro
            log(`Mensaje de bienvenida enviado a ${normalizedUser} del grupo ${groupName}`);
        } catch (error) {
            logError(`Error enviando mensaje a ${normalizedUser}: ${error.message}`);
        }
    } else {
        log(`Usuario ${normalizedUser} ya contactado. Omitiendo.`);
    }
}

// === Lógica Principal del Bot ===
async function startBot() {
    console.log(`
${chalk.blue('███████╗███████╗██████╗ ███████╗██████╗ ███████╗')}
${chalk.blue('██╔════╝██╔════╝██╔══██╗██╔════╝██╔══██╗██╔════╝')}
${chalk.blue('███████╗█████╗  ██████╔╝█████╗  ██████╔╝███████╗')}
${chalk.blue('╚════██║██╔══╝  ██╔══██╗██╔══╝  ██╔══██╗╚════██║')}
${chalk.blue('███████║███████╗██║  ██║███████╗██║  ██║███████║')}
${chalk.blue('╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝')}
                                                                   
    `);

    loadSentRecords();
    loadUserData();

    const sessionPath = './session';
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        browser: Browsers.macOS("Desktop"),
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            console.log(chalk.yellow("📌 Escanea este QR con tu WhatsApp:"));
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(chalk.red(`Conexión cerrada. Razón: ${statusCode}`));
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log(chalk.yellow('Reconectando...'));
                await startBot();
            } else {
                console.log(chalk.red('Sesión cerrada. Por favor, elimina la carpeta session e inicia de nuevo.'));
            }
        } else if (connection === "open") {
            console.log(chalk.green("✅ Bot conectado a WhatsApp"));

            const groups = await sock.groupFetchAllParticipating();
            for (const group of Object.values(groups)) {
                if (group.participants) {
                    const groupName = group.subject;
                    for (const participant of group.participants) {
                        await sendWelcomeMessageWithPersistence(sock, participant.id, groupName);
                    }
                }
            }
        }
    });

    sock.ev.on('group-participants.update', async (update) => {
        const groupId = update.id;
        if (update.action === 'add') {
            const groupMetadata = await sock.groupMetadata(groupId);
            const groupName = groupMetadata.subject;
            for (const participant of update.participants) {
                await sendWelcomeMessageWithPersistence(sock, participant, groupName);
            }
        }
    });

    cron.schedule('0 8 * * *', async () => {
        const groupJid = 'TU_JID_DE_GRUPO@g.us'
        const message = '¡Buenos días! Este es un recordatorio diario. ¡Que tengas un gran día!'
        try {
            await sock.sendMessage(groupJid, { text: message })
            log(`Mensaje diario enviado a [${groupJid}]`)
        } catch (e) {
            logError(`Error al enviar mensaje programado: ${e.message}`)
        }
    })

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type === "notify") {
            const m = messages[0];
            const senderParticipant = m.key.participant || m.key.remoteJid;
            const senderJid = m.key.remoteJid;
            const isGroup = senderJid.endsWith('@g.us');
            const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
            const senderName = m.pushName || senderParticipant.split('@')[0];

            if (m.message?.protocolMessage?.type === 'REVOKE') {
                const deletedMsgKey = m.message.protocolMessage.key
                const participantJid = deletedMsgKey.participant || senderJid
                const senderName = m.pushName || participantJid.split('@')[0]
                logWarning(`🗑️ ALERTA: Mensaje eliminado por ${senderName} en [${senderJid}].`)
                return
            }

            if (isGroup) {
                awardPoints(senderParticipant);
            }

            if (!m.key.fromMe) {
                if (isWordFilterEnabled) {
                    for (const word of OFFENSIVE_WORDS) {
                        if (messageText.toLowerCase().includes(word.toLowerCase())) {
                            await sock.sendMessage(senderJid, { text: `⚠️ Por favor, mantén un lenguaje respetuoso. El uso de palabras ofensivas no está permitido.` });
                            logWarning(`😠 Alerta: Palabra ofensiva detectada de ${senderName} en [${senderJid}]`);
                            return;
                        }
                    }
                }

                if (isAntiLinkEnabled && isGroup && messageText.match(/(https?:\/\/[^\s]+)/gi)) {
                    try {
                        const groupMetadata = await sock.groupMetadata(senderJid);
                        const senderIsAdmin = groupMetadata.participants.find(p => p.id === senderParticipant)?.admin !== null;

                        if (!senderIsAdmin) {
                            await sock.sendMessage(senderJid, { delete: m.key });
                            await sock.groupParticipantsUpdate(senderJid, [senderParticipant], 'remove');
                            logWarning(`🚫 Anti-Link: Mensaje con enlace de ${senderName} eliminado en [${senderJid}]. Usuario expulsado.`);
                        } else {
                            log(`ℹ️ Anti-Link: Enlace ignorado, el remitente es un administrador.`);
                        }
                    } catch (e) {
                        logError(`Error en Anti-Link: ${e.message}`);
                    }
                    return;
                }

                await handleGeneralCommands(sock, m, messageText);
                await handleCreatorCommands(sock, senderJid, messageText);
            }
        }
    });
}

startBot();
