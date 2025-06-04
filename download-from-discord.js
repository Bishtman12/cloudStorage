const fs = require('graceful-fs');
const { decryptFile } = require("./utils");
let { DEFAULT_DOWNLOAD_FILE_PATH, UPLOADER_PREFIX, DISCORD_API_URL, DISCORD_BOT_TOKEN, DISCORD_SERVER_NAME, RANDOM_STRING_TO_GET_LARGE_FILE } = require("./config");
const { encryptString } = require("./utils")
UPLOADER_PREFIX = encryptString(UPLOADER_PREFIX);
const axios = require('axios');
const path = require("path");
const { pipeline } = require('stream/promises');

const DISCORD_API_HEADERS = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'Content-Type': 'application/json',
}

function downloadAndDecodeFilesFromDiscord(channelId, folderPrefix, lastMessageId) {
    return new Promise(async (resolve, reject) => {
        try {
            let count = 0;
            if (!lastMessageId) {
                console.log("THE CHANNEL IS EMPTY")
                return resolve(true)
            }
            const messageUrl = `${DISCORD_API_URL}/channels/${channelId}/messages/${lastMessageId}`;
            const messageData = (await axios.request({
                method: 'GET',
                url: messageUrl,
                headers: DISCORD_API_HEADERS,
            })).data;
            const { url, filename } = messageData.attachments[0];
            await downloadFileFromUrl(url, `${folderPrefix}/${filename}`)

            while (true) {
                if (!lastMessageId) {
                    break;
                }
                const serverUrl = `${DISCORD_API_URL}/channels/${channelId}/messages?limit=100&before=${lastMessageId}`;
                const messageList = (await axios.request({
                    method: 'GET',
                    url: serverUrl,
                    headers: DISCORD_API_HEADERS,
                })).data;

                if (!messageList.length) break
                const promiseArray = []
                for (let i = 0; i < messageList.length; i += 1) {
                    const { url, filename } = messageList[i].attachments[0];
                    promiseArray.push(downloadFileFromUrl(url, `${folderPrefix}/${filename}`))
                }
                await Promise.all(promiseArray);
                count += messageList.length
                console.log(`TOTAL DOWNLOADED FILES : ${count}`)
                lastMessageId = messageList[messageList.length - 1]?.id
            }
            return resolve(true)
        }
        catch (error) {
            reject(error)
        }
    })
}

function downloadFileFromUrl(url, finalPath) {
    return new Promise(async (resolve, reject) => {
        try {

            let attempts = 0;
            const maxAttempts = 3;
            const delay = 1000;
            const factor = 2;
            let response;
            while (attempts < maxAttempts) {
                try {
                    response = await axios.get(url, { responseType: 'arraybuffer' });
                    break; // If successful, exit the loop
                } catch (error) {
                    attempts++;
                    const retryDelay = delay * Math.pow(factor, attempts);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
            if (attempts === maxAttempts) {
                throw new Error(`Failed to download file after ${maxAttempts} attempts`);
            }
            decryptFile(response.data, finalPath);
            resolve(true);

        } catch (error) {
            reject(error);
        }
    });
}

async function mergeMultipleFileSets(directoryPath) {

    const files = fs.readdirSync(directoryPath);

    const fileGroups = {};

    for (const file of files) {

        const parts = file.split(RANDOM_STRING_TO_GET_LARGE_FILE);
        // [1,10,fileName]
        const partNumber = parseInt(parts[0]) - 1;
        const totalParts = parseInt(parts[1]);

        //!Hope No-One has my prefix starting FILE or GG

        const fileName = parts[2];
        if (!fileGroups[fileName]) {
            fileGroups[fileName] = new Array(totalParts)
        }
        fileGroups[fileName][partNumber] = file;
    }

    for (const fileName in fileGroups) {

        const filesArray = fileGroups[fileName];
        let completePart = true;
        for (const element of filesArray) {
            if (!element) {
                completePart = false;
                break;
            }
        }

        if (!completePart) {
            console.error("PARTS ARE MISSING FOR THE FILE", fileName);
            continue;
        }

        const outputFilePath = path.join(`${UPLOADER_PREFIX}${DEFAULT_DOWNLOAD_FILE_PATH}`, fileName);

        const writeStream = fs.createWriteStream(outputFilePath);

        for (const filePart of filesArray) {
            const filePath = path.join(directoryPath, filePart);
            const readStream = fs.createReadStream(filePath);
            await pipeline(readStream, writeStream, { end: false });
        }
        writeStream.end();
        console.log(`Files merged successfully into: ${outputFilePath}`);
    }
}

async function runTheDownloadFromDiscord() {
    let serverId;
    const serverUrl = `${DISCORD_API_URL}/users/@me/guilds`;
    const serverList = (await axios.request({
        method: 'GET',
        url: serverUrl,
        headers: DISCORD_API_HEADERS,
    })).data;


    for (const element of serverList) {
        if (element.name === DISCORD_SERVER_NAME) {
            serverId = element.id
            break;
        }
    }
    const url = `${DISCORD_API_URL}/guilds/${serverId}/channels`;
    const listChannel = (await axios.request({
        method: 'GET',
        url,
        headers: DISCORD_API_HEADERS,
    })).data;

    const small_channel_name = `${UPLOADER_PREFIX}-small-images`;
    const large_channel_name = `${UPLOADER_PREFIX}-large-images`;

    for (const element of listChannel) {

        if (element.name === small_channel_name) {

            console.log("******** DOWNLOADING AND DECODING THE SMALL FILES FROM DISCORD********")
            const folderPath = `${UPLOADER_PREFIX}${DEFAULT_DOWNLOAD_FILE_PATH}`;

            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }
            await downloadAndDecodeFilesFromDiscord(element.id, folderPath,  element.last_message_id)
            console.log("******** SMALL FILES ARE DOWNLOADED ON YOUR LOCAL ********")
        };

        if (element.name === large_channel_name) {
            console.log("******** DOWNLOADING AND DECODING THE LARGE FILES FROM DISCORD********")
            //create the folder 
            const folderPath = `${UPLOADER_PREFIX}${DEFAULT_DOWNLOAD_FILE_PATH}/large`;
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }
            await downloadAndDecodeFilesFromDiscord(element.id, folderPath, element.last_message_id)
            console.log("******** LARGE FILES ARE DOWNLOADED ON YOUR LOCAL ********")
            await mergeMultipleFileSets(folderPath)
            fs.rmSync(folderPath, { recursive: true })
        }
    };
}

runTheDownloadFromDiscord()

module.exports = {
    runTheDownloadFromDiscord
}