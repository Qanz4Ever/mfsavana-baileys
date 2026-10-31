module.exports = {
	apps: [
		{
			name: 'mfsavana-baileys-prod',
			script: 'bot.js',
			cwd: __dirname,
			instances: 1, // Wajib 1 instance per sesi WhatsApp (mencegah error 440 Stream Replaced)
			autorestart: true,
			watch: false,
			max_memory_restart: '600M',
			restart_delay: 3000,
			kill_timeout: 5000,
			env: {
				NODE_ENV: 'production',
				SESSION_FOLDER: './session',
				LOG_LEVEL: 'silent',
				PAIRING_CODE: 'MFSAVANA'
			}
		}
	]
}
