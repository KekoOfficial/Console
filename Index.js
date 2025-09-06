// wa-spam-bot.js
// npm install @whiskeysockets/baileys qrcode

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const readline = require('readline');

const AUTH_FOLDER = './auth_info';
const OWNER_NUMBER = '595984495031@s.whatsapp.net'; // Owner verdadero
const MAIN_NUMBER = '595984566902@s.whatsapp.net'; // El número principal para sesión

let sendCounter = 0; // Para sistema anti-spam

function getAntiSpamText() {
    const now = new Date();
    sendCounter++;
    return `Únete ❤️‍🩹
https://chat.whatsapp.com/He3gbHmBzeP31qiMaAyIuA?mode=ems_copy_t

Hora: ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}:${now.getMilliseconds()}
Fecha: ${now.toLocaleDateString()}
Día: ${now.toLocaleString('es', { weekday: 'long' })}
Contador: ${sendCounter}`;
}

async function main(GROUP_ID) {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
        version,
        auth: state,
        browser: ['SpamBot', 'Desktop', '1.0.0'],
        getMessage: async key => ({ conversation: '' })
    });
    sock.ev.on('creds.update', saveCreds);

    // QR manual
    sock.ev.on('connection.update', async update => {
        const { qr, connection } = update;
        if (qr) {
            qrcode.toString(qr, { type: 'terminal' }, (err, url) => {
                if (!err) {
                    console.log('\nEscanea este QR en WhatsApp > Dispositivos vinculados > Vincular un dispositivo:\n');
                    console.log(url);
                }
            });
        }
        if (connection === 'open') {
            console.log('Conexión establecida. ¡Listo para operar!');
            // Llama a la función principal de spam
            spamToGroupMembers(sock, GROUP_ID);
        }
    });
}

// Extrae los números del grupo y les envía el mensaje individualmente
async function spamToGroupMembers(sock, GROUP_ID) {
    try {
        // Obtén participantes del grupo
        const groupMetadata = await sock.groupMetadata(GROUP_ID);
        const miembros = groupMetadata.participants.filter(p => !p.admin); // Excluye admins si quieres
        console.log('Miembros encontrados:', miembros.length);

        for (const miembro of miembros) {
            // Sistema anti-spam: espera entre 2 y 8 segundos aleatorio entre cada envío
            const waitMs = Math.floor(Math.random() * 6000) + 2000;
            const spamText = getAntiSpamText();
            await sock.sendMessage(miembro.id, { text: spamText });
            console.log('Mensaje enviado a:', miembro.id, 'Esperando', waitMs, 'ms');
            await new Promise(res => setTimeout(res, waitMs));
        }
        console.log('Todos los mensajes enviados.');
    } catch (err) {
        console.error('Error al enviar mensajes:', err);
    }
}

// Interfaz CLI para pegar JID de grupo antes de conectar
function startCLI() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Pega el JID del grupo (ejemplo: 1234567890-1234567890@g.us): ', jid => {
        if (jid && jid.endsWith('@g.us')) {
            rl.close();
            main(jid);
        } else {
            console.log('JID inválido. Intenta de nuevo.');
            rl.close();
        }
    });
}

startCLI();