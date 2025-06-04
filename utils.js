const crypto = require('crypto');
const fs = require('graceful-fs');
const algorithm = 'aes-256-cbc';
const { ENN_SECRET_KEY, ENC_IV } = require("./config");

const key = Buffer.from(ENN_SECRET_KEY, 'hex');
const iv = Buffer.from(ENC_IV, 'hex');


function getSystemPerformance() {
    const memoryUsage = process.memoryUsage();
    const cpuLoad = os.loadavg(); // Returns an array with 1, 5, and 15-minute load averages
    return {
        memoryUsage: {
            rss: memoryUsage.rss,
            heapTotal: memoryUsage.heapTotal,
            heapUsed: memoryUsage.heapUsed,
            external: memoryUsage.external
        },
        cpuLoad: {
            oneMinute: cpuLoad[0],
            fiveMinutes: cpuLoad[1],
            fifteenMinutes: cpuLoad[2]
        }
    };
}

function logPerformanceInfo(label) {
    const performance = this.getSystemPerformance();
    console.log("-------------------------------------")
    console.log(`[${label}] Memory Usage (RSS): ${performance.memoryUsage.rss / 1024 / 1024} MB`);
    console.log(`[${label}] Memory Usage (Heap Used): ${performance.memoryUsage.heapUsed / 1024 / 1024} MB`);
    console.log(`[${label}] CPU Load (1 min): ${performance.cpuLoad.oneMinute}`);
    console.log(`[${label}] CPU Load (5 min): ${performance.cpuLoad.fiveMinutes}`);
    console.log(`[${label}] CPU Load (15 min): ${performance.cpuLoad.fifteenMinutes}`);
}

function encryptFile(inputFile, outputFile) {
    try {

        const fileData = fs.readFileSync(inputFile);

        const cipher = crypto.createCipheriv(algorithm, key, iv);

        let encrypted = cipher.update(fileData);
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        fs.writeFileSync(outputFile, encrypted);
        return true

    }
    catch (err) {
        console.error(`Error encrypting file: ${err.message}`);
    }
}

function encryptFileViaBuffer(fileData, outputFile) {
    try {

        const cipher = crypto.createCipheriv(algorithm, key, iv);

        let encrypted = cipher.update(fileData);
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        fs.writeFileSync(outputFile, encrypted);
        return true

    }
    catch (err) {
        console.error(`Error encrypting file: ${err.message}`);
    }
}

function decryptFile(inputBuffer, outputFile) {
    try {

        const decipher = crypto.createDecipheriv(algorithm, key, iv);

        let decrypted = decipher.update(inputBuffer);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        fs.writeFileSync(outputFile, decrypted);

        return true

    } catch (err) {
        console.error(`Error decrypting file: ${err.message}`);
    }
}


function encryptString(input) {

    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(input);
    encrypted = Buffer.concat([encrypted, cipher.final()]).toString('hex');

    return encrypted
}

function generateSecretKeyAndIV(inputString) {

    const hash = crypto.createHash('sha256').update(inputString).digest();

    const secretKey = hash.slice(0, 16).toString('hex');

    const iv = hash.slice(16, 32).toString('hex');

    return { secretKey, iv };
}

module.exports = {
    getSystemPerformance,
    logPerformanceInfo,
    encryptFile,
    decryptFile,
    encryptFileViaBuffer,
    generateSecretKeyAndIV,
    encryptString
};
