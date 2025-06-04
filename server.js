const express = require('express');
const { google } = require('googleapis');
const fs = require('graceful-fs').promises;
const Photos = require('googlephotos');
const EventEmitter = require('events');
const app = express();
const logEvents = new EventEmitter();
const { GOOGLE_CLIENT_ID, GOOGLE_CALLBACK_URL, GOOGLE_CLIENT_SECRET } = require("./config");

const {
    runUploadService,
    startPhotosDownloadScript,
    getFilesReadyToUpload
} = require("./media-manager");

const models = require('./db/sequelize');

global.dbConnection = models.sequelize;
const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL
);

const SCOPES = [Photos.Scopes.READ_ONLY];

// Override console.log
const originalConsoleLog = console.log;
console.log = function () {
    originalConsoleLog.apply(console, arguments);
    const message = Array.from(arguments).join(' ');
    logEvents.emit('log', message);
};

// SSE endpoint
app.get('/logs', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const listener = (message) => {
        res.write(`data: ${message}\n\n`);
    };

    logEvents.on('log', listener);

    req.on('close', () => {
        logEvents.removeListener('log', listener);
    });
});

app.get('/', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    res.send(`
        <h1>Google Photos API Authentication</h1>
        <a href="${authUrl}">Authenticate with Google</a>
        <br><br>
        <h2>Application Logs</h2>
        <div id="logs" style="width: 100%; height: 200px; overflow-y: scroll; border: 1px solid #ccc; padding: 10px; font-family: monospace;"></div>
        <script>
            const logsDiv = document.getElementById('logs');
            const eventSource = new EventSource('/logs');

            eventSource.onmessage = function(event) {
                const logEntry = document.createElement('div');
                logEntry.textContent = event.data;
                logsDiv.appendChild(logEntry);
                logsDiv.scrollTop = logsDiv.scrollHeight;
            };

            eventSource.onerror = function(error) {
                console.error('EventSource failed:', error);
                eventSource.close();
            };
        </script>
    `);
});

app.get('/oauth2callback', async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Save the tokens to a file
        await fs.writeFile('tokens.json', JSON.stringify(tokens));

        console.log('Authentication successful! You can now use the API.');
        res.send(`
            <h1>Authentication Successful</h1>
            <p>You can now use the API.</p>
            <a href="/download">Start Download</a>
            <br><br>
            <h2>Application Logs</h2>
            <div id="logs" style="width: 100%; height: 200px; overflow-y: scroll; border: 1px solid #ccc; padding: 10px; font-family: monospace;"></div>
            <script>
                const logsDiv = document.getElementById('logs');
                const eventSource = new EventSource('/logs');

                eventSource.onmessage = function(event) {
                    const logEntry = document.createElement('div');
                    logEntry.textContent = event.data;
                    logsDiv.appendChild(logEntry);
                    logsDiv.scrollTop = logsDiv.scrollHeight;
                };

                eventSource.onerror = function(error) {
                    console.error('EventSource failed:', error);
                    eventSource.close();
                };
            </script>
        `);
    } catch (error) {
        console.error('Error retrieving access token', error);
        res.status(500).send('Authentication failed');
    }
});

app.get('/download', async (req, res) => {

    res.send(`
        <h1>Download in Progress</h1>
        <p>The download process has started. Check the logs below for progress.</p>
        <div id="logs" style="width: 100%; height: 400px; overflow-y: scroll; border: 1px solid #ccc; padding: 10px; font-family: monospace;"></div>
        <script>
            const logsDiv = document.getElementById('logs');
            const eventSource = new EventSource('/logs');

            eventSource.onmessage = function(event) {
                const logEntry = document.createElement('div');
                logEntry.textContent = event.data;
                logsDiv.appendChild(logEntry);
                logsDiv.scrollTop = logsDiv.scrollHeight;
            };

            eventSource.onerror = function(error) {
                console.error('EventSource failed:', error);
                eventSource.close();
            };
        </script>
    `);

    try {

        console.log('Starting startPhotosDownloadScript...');
        const result = await startPhotosDownloadScript();
        if (!result) {
            
        }
        console.log('startPhotosDownloadScript completed.');

        console.log('Starting getFilesReadyToUpload...');
        await getFilesReadyToUpload();
        console.log('getFilesReadyToUpload completed.');

        console.log('Starting runUploadService...');
        await runUploadService();
        console.log('runUploadService completed.');

        console.log('All processes completed successfully.');
    } catch (error) {
        console.error('Error during download process:', error);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));