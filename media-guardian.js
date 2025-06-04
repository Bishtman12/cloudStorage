const fs = require('graceful-fs');
const { MAX_FILE_SIZE_IN_KB } = require("./config");
const { encryptFile, encryptFileViaBuffer } = require("./utils");
const UPLOAD_BATCH_FILE = 100;
const { DEFAULT_UPLOAD_FILE_PATH_FOR_SMALL_FILES, DEFAULT_UPLOAD_FILE_PATH_FOR_LARGE_FILES, RANDOM_STRING_TO_GET_LARGE_FILE,DEFAULT_DOWNLOAD_FILE_PATH } = require("./config")

async function getFilesReadyToUploadHelper() {

    const filesArray = fs.readdirSync(DEFAULT_DOWNLOAD_FILE_PATH);

    if (!fs.existsSync(DEFAULT_UPLOAD_FILE_PATH_FOR_SMALL_FILES)) {
        fs.mkdirSync(DEFAULT_UPLOAD_FILE_PATH_FOR_SMALL_FILES, { recursive: true });
    }

    for (let i = 0; i < filesArray.length; i += UPLOAD_BATCH_FILE) {
        console.log(`ENCRYPTED ${i}/${filesArray.length}`)
        const batch = filesArray.slice(i, i + UPLOAD_BATCH_FILE);
        await Promise.all(batch.map(async (file) => {
            const filePath = `${DEFAULT_DOWNLOAD_FILE_PATH}/${file}`;
            const fileStat = fs.statSync(filePath);
            const fileSize = (fileStat.size) / 1024;


            if (fileSize > MAX_FILE_SIZE_IN_KB) {
                const splitCount = Math.ceil(fileSize / MAX_FILE_SIZE_IN_KB)
                await splitAndDownloadLargeFiles(filePath, file, splitCount);
            }
            else {
                const outPutFilePath = `${DEFAULT_UPLOAD_FILE_PATH_FOR_SMALL_FILES}/${file}`;
                encryptFile(filePath, outPutFilePath);
            }
        }));
    }
    console.log(`ENCRYPTED FILES:${filesArray.length}/${filesArray.length}`)
}

function splitAndDownloadLargeFiles(filePath, file, splitCount) {
    return new Promise(async (resolve, reject) => {
        try {
            const readStream = fs.createReadStream(filePath);
            let split_size = MAX_FILE_SIZE_IN_KB;
            let bufferArray = Buffer.alloc(0);
            let split_count = 1;
            const fileName = `${RANDOM_STRING_TO_GET_LARGE_FILE}${splitCount}${RANDOM_STRING_TO_GET_LARGE_FILE}${file}`
            //! gives me the 64kb of data every time it streams

            readStream.on('data', (chunk) => {
                bufferArray = Buffer.concat([bufferArray, chunk]);

                if (bufferArray.length >= split_size * 1024) {
                    if (!fs.existsSync(`${DEFAULT_UPLOAD_FILE_PATH_FOR_LARGE_FILES}`)) {
                        fs.mkdirSync(`${DEFAULT_UPLOAD_FILE_PATH_FOR_LARGE_FILES}`, { recursive: true });
                    }   
                    //1LARGEEGRAL10LARGEEGRALfileName
                    // [1,10,fileName]
                    encryptFileViaBuffer(bufferArray, `${DEFAULT_UPLOAD_FILE_PATH_FOR_LARGE_FILES}/${split_count}${fileName}`);
                    split_count += 1
                    bufferArray = Buffer.alloc(0)
                }
            });

            readStream.on('end', () => {
                if (bufferArray.length) {
                    if (!fs.existsSync(`${DEFAULT_UPLOAD_FILE_PATH_FOR_LARGE_FILES}`)) {
                        fs.mkdirSync(`${DEFAULT_UPLOAD_FILE_PATH_FOR_LARGE_FILES}`, { recursive: true });
                    }
                    encryptFileViaBuffer(bufferArray, `${DEFAULT_UPLOAD_FILE_PATH_FOR_LARGE_FILES}/${split_count}${fileName}`);
                }
                split_count += 1
                resolve(true)
            });

            readStream.on('error', (err) => {
                console.error('Error:', err);
            });
        }
        catch (error) {
            reject(error)
        }
    })
}

async function getFilesReadyToUpload() {
    console.log(`ENCRYPTION STARTED FOR DOWNLOADED FILES`)
    await getFilesReadyToUploadHelper()
    console.log(`ENCRYPTION DONE FOR FOR DOWNLOADED FILES`)
}

module.exports = {
    getFilesReadyToUpload
}