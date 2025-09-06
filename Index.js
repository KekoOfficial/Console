const { makeWASocket, useMultiFileAuthState, DisconnectReason, jidNormalizedUser, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const cron = require('node-cron');
const qrcode = require('qrcode-terminal');
const chalk = require('chalk');

// === Configuración del Bot (Valores fijos) ===
const botVersion = "1.0.0";

// === Variables y Funciones para el Manejo de Bienvenida ===
const SENT_FILE = './sentUsers.json';
let sentUsers = [];

// Asegura que las carpetas existan
if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs');
}
if (!fs.existsSync('./session')) {
    fs.mkdirSync('./session');
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

const log = (message) => {
    console.log(chalk.green(`> ✅ Log: ${message}`));
};

const logError = (message) => {
    console.error(chalk.red(`> ❌ Error: ${message}`));
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
║ Únete Porfavor Pará Hacer Amigos
 https://chat.whatsapp.com/He3gbHmBzeP31qiMaAyIuA?mode=ems_copy_c

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
        const groupJid = 'TU_JID_DE_GRUPO@g.us';
        const message = '¡Buenos días! Este es un recordatorio diario. ¡Que tengas un gran día!';
        try {
            await sock.sendMessage(groupJid, { text: message });
            log(`Mensaje diario enviado a [${groupJid}]`);
        } catch (e) {
            logError(`Error al enviar mensaje programado: ${e.message}`);
        }
    });
}

startBot();
