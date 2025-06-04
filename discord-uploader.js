const axios = require('axios');
const fs = require('graceful-fs');
const path = require('path');
const FormData = require('form-data');
let { DISCORD_BOT_TOKEN, DISCORD_API_URL, DISCORD_SERVER_NAME, UPLOADER_PREFIX } = require("./config");
const SMALL_IMAGES_DIR = './uploads/small';
const LARGE_IMAGES_DIR = './uploads/large';
const { encryptString } = require("./utils")
UPLOADER_PREFIX = encryptString(UPLOADER_PREFIX);
const DISCORD_API_HEADERS = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'Content-Type': 'application/json',
}
const UPLOAD_BATCH_FILE = 3;

async function createServer(serverName) {
    const listServersUrl = `${DISCORD_API_URL}/users/@me/guilds`;

    const listServers = (await axios.request({
        method: 'GET',
        url: listServersUrl,
        headers: DISCORD_API_HEADERS,
    })).data;

    for (const server of listServers) {
        if (server.name === DISCORD_SERVER_NAME) {
            return server;
        }
    }
    const url = `${DISCORD_API_URL}/guilds`;
    const payload = { name: serverName };

    const response = await axios.request({
        method: 'POST',
        url: url,
        headers: DISCORD_API_HEADERS,
        data: payload,
    });

    return response.data;
}

async function uploadFileViaStreamHelper(channelId, filePath) {
    const url = `${DISCORD_API_URL}/channels/${channelId}/messages`;
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    const response = await axios.request({
        method: 'POST',
        url: url,
        headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
            ...formData.getHeaders(),
        },
        data: formData,
    });

    return response.data;
}

function uploadFileViaStream(channelId, filePath) {
    return new Promise(async (resolve, reject) => {

        const tries = 4;
        const delay = 300;
        const factor = 5;
        const accepted = [200];

        const fetchDataWithRetry = async (tryCount, currentDelay) => {
            try {
                const result = await uploadFileViaStreamHelper(channelId, filePath);
                resolve(result);
            }
            catch (err) {
                if (accepted && accepted.includes(err?.status)) {
                    resolve(false);
                }
                else {
                    if (tryCount > 1) {
                        setTimeout(() => { fetchDataWithRetry(tryCount - 1, currentDelay * factor); }, currentDelay);
                    }
                    else {
                        console.log(`FAILED TO DOWNLOAD THE FILE: ${filePath}`)
                        fs.appendFileSync('upload_errors.log', `FAILED TO DOWNLOAD THE FILE: ${filePath}\n`, { encoding: 'utf8' });
                        resolve(false)
                    }
                }
            }
        };
        fetchDataWithRetry(tries, delay);
    });
}

// Helper function to upload all images from a directory to a channel
async function uploadImagesFromDirectory(channelId, directoryPath) {
    try {
        const files = fs.readdirSync(directoryPath);

        for (let i = 0; i < files.length; i += UPLOAD_BATCH_FILE) {
            const uploadPromises = files.slice(i, i + UPLOAD_BATCH_FILE).map(file => {
                const filePath = path.join(directoryPath, file);
                return uploadFileViaStream(channelId, filePath)
            });
            await Promise.all(uploadPromises);
            console.log(`Uploaded FILES ${i}/${files.length} ...`)
        }
    } catch (error) {
        console.error(`Error uploading images from directory ${directoryPath} to channel ${channelId}: ${error}`);
    }
}

async function getInviteCode(guildId) {
    try {
        const url = `${DISCORD_API_URL}/channels/${guildId}/invites`;
        const payload = {
            max_age: 3600,
            max_uses: 10,
            temporary: false,
        };

        const response = (await axios.request({
            method: 'POST',
            url: url,
            headers: DISCORD_API_HEADERS,
            data: payload,
        })).data;

        console.log("********************");
        console.log(`JOIN THE DISCORD SERVER VIA THIS LINK https://discord.com/invite/${response.code}`);
        console.log("********************");

        return true;
    } catch (error) {
        throw error;
    }
}

async function createChannel(guildId, channelName) {

    const url = `${DISCORD_API_URL}/guilds/${guildId}/channels`;
    const listChannel = (await axios.request({
        method: 'GET',
        url,
        headers: DISCORD_API_HEADERS,
    })).data;

    for (const channel of listChannel) {
        if (channel.name === channelName) {
            return channel;
        }
    }
    const payload = {
        name: channelName,
        type: 0, // text channel
    };

    const response = await axios.request({
        method: 'POST',
        url: url,
        headers: DISCORD_API_HEADERS,
        data: payload,
    });

    return response.data;
}

async function runUploadService() {
    try {
        const server = await createServer(DISCORD_SERVER_NAME);
        const guildId = server.id;

        if (server.system_channel_id) await getInviteCode(server.system_channel_id);

        const smallImagesChannel = await createChannel(guildId, `${UPLOADER_PREFIX}-small-images`);
        const largeImagesChannel = await createChannel(guildId, `${UPLOADER_PREFIX}-large-images`);

        console.log(`Channels created: small-images (${smallImagesChannel.id}), large-images (${largeImagesChannel.id})`);

        console.log("STARTING UPLOADING THE SMALL MEDIA FILES")
        await uploadImagesFromDirectory(smallImagesChannel.id, SMALL_IMAGES_DIR);
        console.log("FINISHED UPLOADING THE SMALL MEDIA FILES")

        console.log("STARTING UPLOADING THE LARGE MEDIA FILES")
        await uploadImagesFromDirectory(largeImagesChannel.id, LARGE_IMAGES_DIR);
        console.log("FINISHED UPLOADING THE LARGE MEDIA FILES")

        console.log('All images are uploaded successfully!');
    } catch (error) {
        console.error('Error:', error.message);
    }
}

module.exports = {
    runUploadService
}
