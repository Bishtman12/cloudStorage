# Google Photos to Discord Media Manager

## Prerequisites

### Google OAuth 2.0 Setup
1. Create a new project in the [Google Cloud Console](https://console.cloud.google.com)
2. Enable the Google Photos API
3. Configure OAuth 2.0 credentials
4. Copy the Client ID and Client Secret to `config.js`
5. Add the callback URI from `config.js` to the OAuth consent screen in Google Cloud Console
   - Note: Changes may take up to 5 minutes to propagate
   - You may see Error 400 (redirect_uri_mismatch) during this period

### Discord Bot Setup
1. Visit [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Navigate to the Bot section and create a bot
4. Generate and copy the bot token to `config.js`

### Encryption Setup
1. Generate encryption keys using the utility function in `utils.js`:
   ```javascript
   const { generateSecretKeyAndIV } = require('./utils');
   const result = generateSecretKeyAndIV('your-secret-password');
   console.log('Secret Key:', result.secretKey);
   console.log('IV:', result.iv);
   ```
2. Add the generated values to `config.js`:
   - `ENC_SECRET_KEY`: Your generated secret key
   - `ENC_IV`: Your generated initialization vector

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   node server.js
   ```

3. Access the application:
   - Open `http://localhost:3000` in your browser
   - Authenticate with Google
   - Begin media download process

## Docker Deployment

1. Build the container:
   ```bash
   docker build -t photos-discord-manager .
   ```

2. Run the container:
   ```bash
   docker run -p 3000:3000 photos-discord-manager
   ```

3. Access the application at `http://localhost:3000`

> **Important**: Ensure `config.js` is properly configured before building the Docker image, as configuration values are embedded during build.
