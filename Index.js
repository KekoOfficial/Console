// Importa las librerías necesarias
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Crea una nueva instancia del cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth()
});

// Evento: Cuando el cliente necesita escanear el QR
client.on('qr', qr => {
    // Genera y muestra el código QR en la terminal
    console.log('Escanea este QR con tu teléfono para vincular el bot:');
    qrcode.generate(qr, { small: true });
});

// Evento: Cuando el cliente está listo para usar el bot
client.on('ready', () => {
    console.log('¡Bot listo y conectado! Puedes empezar a enviar mensajes.');
});

// Evento: Cuando se recibe un nuevo mensaje
client.on('message', message => {
    // Si el mensaje es "hola", el bot responderá automáticamente
    if (message.body.toLowerCase() === 'hola') {
        message.reply('¡Hola! Soy un bot automático.');
    }
});

// Inicializa el cliente para iniciar el proceso
client.initialize();
