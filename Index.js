// Importa las librerías
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Crea una nueva instancia del cliente
const client = new Client({
    authStrategy: new LocalAuth()
});

// Evento: Cuando el cliente necesita escanear el QR
client.on('qr', qr => {
    // Genera y muestra el código QR en la terminal
    console.log('Escanea este QR con tu teléfono:');
    qrcode.generate(qr, { small: true });
});

// Evento: Cuando el cliente está listo
client.on('ready', () => {
    console.log('Cliente de WhatsApp listo y conectado.');
});

// Evento: Cuando se recibe un nuevo mensaje
client.on('message', message => {
    // Si el mensaje es "hola", responde automáticamente.
    if (message.body.toLowerCase() === 'hola') {
        message.reply('¡Hola! Soy un bot automático.');
    }
});

// Inicializa el cliente
client.initialize();
