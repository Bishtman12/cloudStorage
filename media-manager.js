const fs = require('graceful-fs');
const Photos = require('googlephotos');
const axios = require("axios");
const { DEFAULT_DOWNLOAD_FILE_PATH, UPLOADER_PREFIX } = require("./config");
const { getFilesReadyToUpload } = require("./media-guardian");
const { runUploadService } = require("./discord-uploader");
const moment = require("moment");
const db = require('./db/sequelize');
const MEDIA_CONFIG = {
    photo: { size: 500, mime_type: 'image', download_type: '=d' },
    image: { size: 500, mime_type: 'image', download_type: '=d' },
    video: { size: 5, mime_type: 'video', download_type: '=dv' }
}
let USER_ID;

async function startPhotosDownloadScript() {

    try {

        const tokens = JSON.parse(fs.readFileSync('tokens.json'));
        const photos = new Photos(tokens.access_token)

        //fetch the user_id and status of the files 
        const query = `SELECT ud.id as user_id, fetched_at
            from
                user_data ud
            left join user_media_items umi on
                ud.id = umi.user_id
            where ud.user_name = '${UPLOADER_PREFIX}' order by umi.fetched_at asc limit 1`

        const last_fetch_date = (await db.sequelize.query(query, { type: db.sequelize.QueryTypes.SELECT }))?.[0];
        USER_ID = last_fetch_date.user_id;

        const difference = moment().diff(moment(last_fetch_date?.fetched_at), 'hours')
        const reFetch = isNaN(difference) || difference > 2;

        if (reFetch) await storeAllThePhotoMetaData(photos);

        const totalFiles = await db.user_media_items.count({ user_id: 1 })

        console.log(`****** TOTAL OF ${totalFiles} FOUND IN THE GOOGLE DRIVE IF YOU HAVE UPLOADED ANY PHOTOS IN THE LAST 2 HOURS TRY AGAIN AFTER 2 HOURS. ******`);

        console.log("******* STARTING DOWNLOADING THE FILES FROM THE DRIVE *********");

        await handleMediaBatchDownload(photos, 'photo');
        await handleMediaBatchDownload(photos, 'video');

        //check and download for failed photos now.
        console.log("DOWNLOADING THE FAILED MEDIA FILES NOW");
        const failed_records = await handleFailureRecords(photos);

        console.log("DOWNLOAD COMPLETED FOR EVERY MEDIA FILES");
        console.timeEnd("Time Logs");

        return failed_records

    }
    catch (error) {
        console.log(error)
        throw error
    }

}

function handleMediaBatchDownload(photos, type) {
    return new Promise(async (resolve, reject) => {
        try {

            let download_count = 0;
            let failure_count = 0;
            let loop_count = 0

            const { size, mime_type, download_type } = MEDIA_CONFIG[type]

            while (true) {
                let query = `SELECT
                file_name,
                base_url,
                mime_type,
                google_photo_id,
                fetched_at
            FROM
                user_media_items where mime_type LIKE '${mime_type}%' and status = 'pending' order by fetched_at desc limit ${size} offset ${Math.floor(loop_count / size)};`;

                let photosData = await db.sequelize.query(query, { type: db.sequelize.QueryTypes.SELECT });

                if (!photosData.length)break;

                //handle and refresh the expiry of media files.
                const difference = moment().diff(moment(photosData[photosData.length-1]?.fetched_at), 'minutes')
                const reFetch = isNaN(difference) || difference > 50;

                if (reFetch) photosData = await refreshMediaMetaData(photos, photosData, size);

                const promiseArray = [];
                for (const element of photosData) promiseArray.push(downloadFileViaStream(photos, element,type))
                const result = await Promise.all(promiseArray);

                const failed_ids = [];
                const success_ids = [];

                for (let i = 0; i < result.length; i++) {
                    if (result[i]) success_ids.push(photosData[i]?.google_photo_id)
                    else failed_ids.push(photosData[i]?.google_photo_id)
                }
                await db.user_media_items.update({ status: 'downloaded' }, { where: { google_photo_id: { [db.Sequelize.Op.in]: success_ids } } });
                await db.user_media_items.update({ status: 'failed' }, { where: { google_photo_id: { [db.Sequelize.Op.in]: failed_ids } } });
                console.log("\n**********************************************************\n");
                console.log(`--> DOWNLOADED TOTAL OF ${download_count} ${type}`);
                console.log(`--> FAILED DOWNLOADS COUNT : ${failure_count} ${type}`);
                console.log("\n**********************************************************\n");
                download_count += success_ids.length
                failure_count += failed_ids.length
                loop_count += 1
            }

            return resolve(true)

        }
        catch (error) {
            reject(error)
        }
    })
}

function storeAllThePhotoMetaData(photos) {
    return new Promise(async (resolve, reject) => {
        try {
            const filters = new photos.Filters(true);
            const mediaTypeFilter = new photos.MediaTypeFilter(photos.MediaType.ALL_MEDIA);
            filters.setMediaTypeFilter(mediaTypeFilter);

            const optionalPageSize = 50;
            let photosApiResponse = await photos.mediaItems.search(filters, optionalPageSize);
            console.log("****** FETCHING ALL THE FILES IN THE DRIVE PLEASE WAIT ******\n");
            console.log("\n**********************************************************\n");

            while (true) {
                if (photosApiResponse.mediaItems && photosApiResponse.mediaItems.length > 0) {
                    const bulkData = photosApiResponse.mediaItems.flatMap(media => [
                        media.filename,
                        media.baseUrl,
                        media.id,
                        media.mimeType,
                        USER_ID,
                        "pending",
                        moment().format("YYYY-MM-DD HH:mm:ss")
                    ]);

                    const placeholders = '(?, ?, ?, ?, ?, ?, ?)';
                    const rowCount = photosApiResponse.mediaItems.length;

                    const query = `
                        INSERT OR REPLACE INTO user_media_items 
                        (file_name, base_url, google_photo_id, mime_type, user_id, status, fetched_at)
                        VALUES
                        ${Array(rowCount).fill(placeholders).join(',\n')}
                    `;

                    await db.sequelize.query(query, {
                        type: db.Sequelize.QueryTypes.INSERT,
                        replacements: bulkData,
                    });
                }

                if (photosApiResponse.nextPageToken) {
                    photosApiResponse = await photos.mediaItems.search(filters, optionalPageSize, photosApiResponse.nextPageToken);
                    console.log(`-> Last fetched media was ${photosApiResponse?.mediaItems?.[0]?.filename}...`);
                }
                else {
                    break;
                }
            }
            resolve(photos);
        } catch (error) {
            reject(error);
        }
    });
}

function refreshMediaMetaData(photos, photosData, CONCURRENT_BATCH_SIZE) {
    return new Promise(async (resolve, reject) => {
        try {

            const finalArray = [];
            const batch_size = Math.min(CONCURRENT_BATCH_SIZE, 50);

            const batchIdsArray = []

            for (const element of photosData) {
                batchIdsArray.push(element.google_photo_id);
            }

            for (let i = 0; i < batchIdsArray.length; i += batch_size) {
                const slicedArray = batchIdsArray.slice(i, i + batch_size);
                if (slicedArray.length) {
                    let mediaItemsBatch = [];
                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                            mediaItemsBatch = (await photos.mediaItems.batchGet(slicedArray))?.mediaItemResults;
                            break;
                        }
                        catch (error) {
                            console.log(`Batch Attempt ${attempt + 1} failed. Retrying...`);
                            if (attempt === 2) {
                                for (const element of slicedArray) {
                                    let singleMediaItem;
                                    for (let attempt = 0; attempt < 3; attempt++) {
                                        try {
                                            singleMediaItem = await photos.mediaItems.get(element);
                                            break;
                                        }
                                        catch (error) {
                                            console.log(`Single Media Item Attempt ${attempt + 1} to get single media item failed. Retrying...`);
                                            if (attempt === 2) {
                                                failed_ids.push(element)
                                            }
                                        }
                                    }
                                    finalArray.push(singleMediaItem)
                                }
                            }
                        }
                    }
                    for (const element of mediaItemsBatch) {
                        const payload = {
                            file_name: element.mediaItem.filename,
                            base_url: element.mediaItem.baseUrl,
                            google_photo_id: element.mediaItem.id,
                            mime_type: element.mediaItem.mimeType
                        }
                        finalArray.push(payload)
                    }
                }
            }
            return resolve(finalArray);
        }
        catch (error) {
            reject(error);
        }
    });
}

function downloadFileViaStreamHelper(options, file_name) {
    return new Promise(async (resolve, reject) => {
        try {

            const FILE_PATH = `${DEFAULT_DOWNLOAD_FILE_PATH}`

            if (!fs.existsSync(FILE_PATH)) {
                fs.mkdirSync(FILE_PATH, { recursive: true });
            }
            const writer = fs.createWriteStream(`${FILE_PATH}/${file_name}`);

            const { uri } = options;

            const response = await axios({
                method: 'get',
                maxBodyLength: Infinity,
                url: uri,
                responseType: 'stream'
            });

            response.data.pipe(writer);

            writer.on('finish', () => {
                resolve(true);
            });

            writer.on('error', (error) => {
                reject(error);
            });
        }
        catch (error) {
            reject(error);
        }
    });
}

function downloadFileViaStream(photos, data, type) {
    return new Promise(async (resolve, reject) => {

        try {
            let { file_name, base_url, google_photo_id } = data

            const options = {
                'method': 'GET',
                'uri': base_url + MEDIA_CONFIG[type]?.download_type,
                'headers': {}
            };

            const tries = 3;
            const delay = 200;
            const factor = 2;

            const fetchDataWithRetry = async (tryCount, currentDelay, fetchFileMetaData = false) => {
                try {
                    
                    let metaData = {};

                    if (fetchFileMetaData) {
                        const singleMediaItem = await photos.mediaItems.get(google_photo_id);
                        metaData = {
                            file_name: singleMediaItem.filename,
                            base_url: singleMediaItem.baseUrl,
                            google_photo_id: singleMediaItem.id
                        }
                    }
                    const result = await downloadFileViaStreamHelper(options, file_name);
                    resolve(result);
                }
                catch (err) {
                    if (tryCount >= 1) {
                        setTimeout(async () => {
                            fetchDataWithRetry(tryCount - 1, currentDelay * factor);
                        }, currentDelay);
                    }
                    else {
                        resolve(false)
                    }
                }
            };
            fetchDataWithRetry(tries, delay);
        }
        catch (error) {
            reject(error)
        }

    });
}

function handleFailureRecords(photos) {
    return new Promise(async (resolve, reject) => {
        try {

            let lastFailedCount = await db.user_media_items.count({ where: { [db.Sequelize.Op.and]: [{ user_id: 1 }, { status: 'failed' }] } });

            while (true) {
                const failedRecords = (await db.sequelize.query(`SELECT * from user_media_items where status = 'failed'`, { type: db.sequelize.QueryTypes.SELECT }));
                const photosData = await refreshMediaMetaData(photos, failedRecords,50);
                for (const element of photosData) {
                    const result = await downloadFileViaStream(photos, element,element.mime_type.split("/")[0]);
                    await db.user_media_items.update({ status: result ? 'downloaded' : 'failed' }, { where: { google_photo_id: element.google_photo_id } });
                    console.log( "-> DOWNLOADED FAILED FILE", element.file_name)
                }
                let currentFailedCount = await db.user_media_items.count({ where: { [db.Sequelize.Op.and]: [{ user_id: 1 }, { status: 'failed' }] } });
                if (lastFailedCount == currentFailedCount) {
                    console.log("FAILED TO DOWNLOAD ", currentFailedCount, "FILES");
                    console.log("****** PLEASE AUTH AGAIN AND TRY THE FAILED DOWNLOADS AGAIN ******");
                    break
                }
                lastFailedCount = currentFailedCount
            }
            return resolve(lastFailedCount);
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = {
    startPhotosDownloadScript,
    getFilesReadyToUpload,
    runUploadService
}